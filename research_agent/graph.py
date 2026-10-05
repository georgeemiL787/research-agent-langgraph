import json
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from .schemas import Strategy, Plan, Assessment, ReviewDecision
from .search import canonical

class State(TypedDict, total=False):
    question: str
    strategy: dict
    tasks: list[str]
    queries: list[str]
    used_queries: list[str]
    discarded_urls: list[str]
    sources: list[dict]
    rounds: int
    revisions: int
    gaps: list[str]
    draft: str
    review_decision: str
    review_reasons: list[str]
    report: str
    errors: list[str]
    status: str

def initial_state(question):
    if not question.strip() or len(question)>2000: raise ValueError("Question must contain 1–2000 characters")
    return {"question":question.strip(),"sources":[],"rounds":0,"revisions":0,
            "used_queries":[],"discarded_urls":[],"gaps":[],"errors":[],"tasks":[]}

def evidence(s):
    return json.dumps(s.get("sources",[]),ensure_ascii=False)[:28000]

def citation_errors(text, sources):
    valid={s["id"] for s in sources}
    found=set(re.findall(r"\[(S\d+)\]",text))
    issues=[f"Unknown citation: {x}" for x in sorted(found-valid)]
    if sources and not found: issues.append("Report has no source citations")
    if re.search(r"https?://",text): issues.append("Draft contains raw URLs; use source IDs only")
    return issues

def build_graph(llm, search, cfg, on_stage_event=None):
    def instrument(name, fn):
        def execute(state):
            if on_stage_event:
                on_stage_event({"status": "active", "node": name}, state)
            try:
                return fn(state)
            except Exception as exc:
                if on_stage_event:
                    on_stage_event(
                        {"status": "failed", "node": name,
                         "error": f"{type(exc).__name__}: {exc}"},
                        state,
                    )
                raise
        return execute

    def supervisor(s):
        strat = llm.structured(f"Choose research strategy for: {s['question']}", Strategy)
        return {"strategy": {"strategy": strat.strategy, "scope": strat.scope, "evidence_requirements": strat.evidence_requirements, "stop_conditions": strat.stop_conditions}}

    def planner(s):
        p=llm.structured(f"Plan 1–3 distinct web search queries and sub-tasks for: {s['question']}\n"
            f"Strategy: {s.get('strategy')}\n"
            f"Date: {datetime.now(timezone.utc).date()}. Gaps: {s['gaps']}. "
            f"Already searched: {s['used_queries']}. Prefer primary sources and opposing evidence.", Plan)
        queries=list(dict.fromkeys(q.strip() for q in p.queries if q.strip() and q not in s['used_queries']))
        return {"queries":queries[:3], "tasks": p.tasks}

    def research_agent(s):
        # Retrieve
        sources=[dict(x) for x in s['sources']]
        seen={canonical(x['url']) for x in sources} | set(s.get('discarded_urls', []))
        errors=list(s['errors'])
        retrieved_now = []
        for q in s['queries']:
            try: results=search.search(q,cfg.results)
            except Exception as exc:
                errors.append(f"Search failed ({q}): {type(exc).__name__}: {exc}"); continue
            for r in results:
                if len(sources) + len(retrieved_now) >= cfg.max_sources: break
                try: key=canonical(r['url'])
                except ValueError: continue
                if key in seen: continue
                seen.add(key)
                try: content,error=search.fetch(r['url'])
                except Exception as exc: content,error="",f"{type(exc).__name__}: {exc}"
                new_src = {"id":f"S{len(sources)+len(retrieved_now)+1}",**r,"content":content,
                    "fetch_error":error,"retrieved_at":datetime.now(timezone.utc).isoformat(),
                    "score":None,"relevant":None,"reason":"Not assessed"}
                retrieved_now.append(new_src)
        
        all_sources = sources + retrieved_now
        
        # Assess
        a=llm.structured(f"Question: {s['question']}\nTasks: {s['tasks']}\nAssess each source's relevance and credibility "
            "using authorship, publisher, primary evidence, date, corroboration, and conflicts. "
            "Do not assume a domain proves credibility. Snippet-only sources have weak evidence. "
            "Give source_id, score 0–1, relevant, reason; identify gaps and whether evidence suffices.\n"
            + json.dumps(all_sources, ensure_ascii=False)[:28000], Assessment)
        
        ratings={r.source_id:r for r in a.ratings}
        final_sources=[]; discarded_urls=list(s.get('discarded_urls', []))
        for source in all_sources:
            x=dict(source); rating=ratings.get(x['id'])
            if rating: x.update(score=rating.score,relevant=rating.relevant,reason=rating.reason)
            if not x['content'] and x['score'] is not None: x['score']=min(x['score'],0.4)
            
            if (x['score'] is not None and x['score'] < 0.2) or x.get('fetch_error'):
                try: discarded_urls.append(canonical(x['url']))
                except ValueError: pass
                continue
            
            final_sources.append(x)
            
        credible=[x for x in final_sources if x['score'] is not None and x['score']>=0.65 and x['relevant'] and x['content']]
        diverse=len({urlsplit(x['url']).hostname for x in credible})>=min(2,cfg.min_credible)
        sufficient=a.sufficient and len(credible)>=cfg.min_credible and diverse
        gaps=a.gaps or ([] if sufficient else ["Need more relevant, fetched evidence from independent publishers"])
        
        return {"sources":final_sources,"errors":errors,"rounds":s['rounds']+1,
                "used_queries":s['used_queries']+s['queries'], "discarded_urls":discarded_urls, "sufficient":sufficient, "gaps":gaps}

    def analyzer(s):
        if not any(x['content'] for x in s['sources']):
            return {"draft":"## Research incomplete\nNo readable web evidence was retrieved. No factual conclusion can be supported."}
        draft=llm.generate(f"Write a research report answering: {s['question']}\n"
            "Use Markdown with answer, evidence, conflicting findings, limitations, and conclusion. "
            "Cite factual claims with [S1] style IDs. No raw URLs or invented references. "
            "Explicitly say when evidence is weak. Revise to address critique if provided.\n"
            f"Tasks: {s['tasks']}\nStrategy: {s.get('strategy')}\n"
            f"Gaps: {s['gaps']}\nReview Reasons: {s.get('review_reasons', [])}\nEvidence DATA:\n"+evidence(s))
        return {"draft":draft}

    def reviewer(s):
        rev=llm.structured(f"Critique this report for unsupported claims, citation support, contradictions, "
            f"missing perspectives and relevance to {s['question']}. Return a decision (retry, research_more, finish) and reasons.\nReport:\n{s['draft']}\nEvidence DATA:\n"+evidence(s), ReviewDecision)
        
        issues = rev.reasons + citation_errors(s['draft'],s['sources'])
        decision = rev.decision
        
        if decision == "finish" and issues:
            decision = "retry"
            
        return {"review_decision": decision, "review_reasons": issues}

    def route_reviewer(s):
        dec = s['review_decision']
        if dec == "research_more" and s['rounds'] < cfg.max_rounds and len(s['sources']) < cfg.max_sources:
            return "planner"
        if dec == "retry" and s['revisions'] < cfg.max_revisions:
            return "retry_prep"
        return "finalize"

    def retry_prep(s):
        return {"revisions": s['revisions']+1, "gaps": s['gaps']+s['review_reasons']}

    def finalize(s):
        issues=citation_errors(s['draft'],s['sources'])
        passed = (s['review_decision'] == 'finish' and not issues)
        report=s['draft']
        if issues: report="## Validation failed\nThe generated draft failed citation checks and is withheld.\n\n"+"\n".join("- "+x for x in issues)
        report += "\n\n---\nResearch status: "+("Evidence gate and self-critique passed (not a factual guarantee)." if passed else "Incomplete / needs human review.")
        if s.get('review_reasons'): report+="\n\n### Unresolved critique\n"+"\n".join("- "+x for x in s['review_reasons'])
        report+="\n\n### Sources\n"
        for x in s['sources']:
            report+=f"- [{x['id']}] {x['title']} — {x['url']} (credibility estimate {x['score']:.2f}; {'page fetched' if x['content'] else 'snippet only'})\n"
        return {"report":report,"status":"complete" if passed else "needs_review"}

    g=StateGraph(State)
    for name,fn in [("supervisor",supervisor),("planner",planner),("research_agent",research_agent),("analyzer",analyzer),("reviewer",reviewer),("retry_prep",retry_prep),("finalize",finalize)]: 
        g.add_node(name,instrument(name,fn))
        
    g.add_edge(START,"supervisor")
    g.add_edge("supervisor","planner")
    g.add_edge("planner","research_agent")
    g.add_edge("research_agent","analyzer")
    g.add_edge("analyzer","reviewer")
    g.add_conditional_edges("reviewer",route_reviewer,{"planner":"planner","retry_prep":"retry_prep","finalize":"finalize"})
    g.add_edge("retry_prep","analyzer")
    g.add_edge("finalize",END)
    
    return g.compile()
