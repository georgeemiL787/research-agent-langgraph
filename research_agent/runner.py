import json
import uuid
from pathlib import Path
from .config import Settings
from .graph import build_graph, initial_state
from .llm import OllamaLLM
from .search import WebSearch
from .demo import DemoLLM, DemoSearch

def components(demo=False,settings=None):
    cfg=settings or Settings()
    llm=DemoLLM() if demo else OllamaLLM(cfg)
    search=DemoSearch() if demo else WebSearch()
    return cfg,llm,search

def run(question,demo=False,on_event=None,settings=None,on_thinking=None,on_stage_event=None):
    cfg,llm,search=components(demo,settings); llm.health()
    thinking_log=[]
    def thinking(text):
        thinking_log.append(text)
        if on_thinking: on_thinking(text)
    llm.on_thinking=thinking
    state=initial_state(question); trace=[]; stage_trace=[]
    detail_keys={
        "supervisor":("strategy",),
        "planner":("tasks","queries"),
        "research_agent":("queries","used_queries","errors","sufficient","gaps"),
        "analyzer":("draft",),
        "reviewer":("review_decision","review_reasons"),
        "retry_prep":("gaps",),
        "finalize":("status","report"),
    }
    def emit_stage(event,state_snapshot):
        payload={"node":event["node"],"status":event["status"],
            "round":state_snapshot.get("rounds",0),
            "sources":len(state_snapshot.get("sources",[])),
            "revision":state_snapshot.get("revisions",0)}
        if "error" in event: payload["error"]=event["error"]
        details={key:state_snapshot[key] for key in detail_keys.get(event["node"],())
                 if key in state_snapshot}
        if event["node"]=="research_agent":
            details["ratings"]=[
                {key:source.get(key) for key in ("id","score","relevant","reason")}
                for source in state_snapshot.get("sources",[])
            ]
        if details: payload["details"]=details
        stage_trace.append(payload)
        if on_stage_event: on_stage_event(payload,state_snapshot)
    graph=build_graph(llm,search,cfg,emit_stage); trace=[]
    limit=20+cfg.max_rounds*5+cfg.max_revisions*8
    for update in graph.stream(state,{"recursion_limit":limit},stream_mode="updates"):
        for node,changes in update.items():
            state.update(changes); event={"node":node,"round":state.get("rounds",0),
                "sources":len(state.get("sources",[])),"revision":state.get("revisions",0)}
            trace.append(event)
            emit_stage({"status":"completed","node":node},state)
            if on_event: on_event(event,state)
    state['trace']=trace; state['stage_trace']=stage_trace
    state['demo']=demo; state['model_thinking']=thinking_log
    if demo:
        state['status']='demo'; state['report']='> OFFLINE DEMO — SYNTHETIC SOURCES, NOT REAL RESEARCH\n\n'+state['report']
    folder=Path(cfg.output_dir)/uuid.uuid4().hex[:12]; folder.mkdir(parents=True,exist_ok=False)
    (folder/'report.md').write_text(state['report'],encoding='utf-8')
    (folder/'research.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
    return state,folder
