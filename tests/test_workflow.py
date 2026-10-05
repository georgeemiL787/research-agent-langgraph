import json
import socket
import httpx
import pytest
from research_agent.config import Settings
from research_agent.demo import DemoLLM, DemoSearch
from research_agent.graph import build_graph, initial_state, citation_errors
from research_agent.runner import run
from research_agent.search import public_url, canonical
from research_agent.llm import OllamaLLM
from research_agent.schemas import Plan, ReviewDecision

def test_full_demo(tmp_path):
    events=[]; stage_events=[]
    s,p=run('test',True,lambda e,s:events.append(e['node']),
            Settings(output_dir=str(tmp_path)),on_stage_event=lambda e,s:stage_events.append((e['node'],e['status'])))
    # supervisor -> planner -> research_agent -> analyzer -> reviewer (research_more) -> planner -> research_agent -> analyzer -> reviewer (finish) -> finalize
    assert s['status']=='demo' and json.loads((p/'research.json').read_text())['demo']
    assert stage_events==[(node,status) for node in events for status in ('active','completed')]
    first_plan=next(e for e in s['stage_trace'] if e['node']=='planner' and e['status']=='completed')
    assert first_plan['details']['queries']

def test_stage_failure_event(tmp_path,monkeypatch):
    class BrokenPlan(DemoLLM):
        def structured(self,prompt,schema):
            raise RuntimeError('model unavailable')
    from research_agent import runner
    stage_events=[]
    monkeypatch.setattr(runner,'components',lambda demo,settings:(settings,BrokenPlan(),DemoSearch()))
    with pytest.raises(RuntimeError,match='model unavailable'):
        run('test',True,settings=Settings(output_dir=str(tmp_path)),
            on_stage_event=lambda e,s:stage_events.append((e['node'],e['status'])))
    assert stage_events==[('supervisor','active'),('supervisor','failed')]

def test_empty():
    class EmptySearch(DemoSearch):
        def search(self,q,limit): return []
    class EmptyLLM(DemoLLM):
        def structured(self,prompt,schema):
            if schema is ReviewDecision: return ReviewDecision(decision="research_more", reasons=["No evidence"])
            return super().structured(prompt,schema)
    s=build_graph(EmptyLLM(),EmptySearch(),Settings(max_rounds=2,max_revisions=0)).invoke(initial_state('test'))
    assert s['rounds']==2 and s['status']=='needs_review' and 'No readable' in s['report']

def test_revision():
    class Revising(DemoLLM):
        checks=0
        def structured(self,prompt,schema):
            if schema is ReviewDecision:
                self.checks+=1
                if self.checks == 1:
                    return ReviewDecision(decision="retry", reasons=["Improve limitations"])
                return ReviewDecision(decision="finish", reasons=[])
            return super().structured(prompt,schema)
    s=build_graph(Revising(),DemoSearch(),Settings()).invoke(initial_state('test'))
    assert s['revisions']==1 and s['status']=='complete'

def test_bad_citation():
    class Bad(DemoLLM):
        def generate(self,prompt,schema=None): return 'Bad claim [S999]'
    s=build_graph(Bad(),DemoSearch(),Settings(max_revisions=0)).invoke(initial_state('test'))
    assert 'Validation failed' in s['report'] and 'Bad claim' not in s['report']

def test_search_failure():
    class Broken(DemoSearch):
        def search(self,q,limit): raise RuntimeError('blocked')
    s=build_graph(DemoLLM(),Broken(),Settings(max_rounds=1,max_revisions=0)).invoke(initial_state('test'))
    assert 'blocked' in s['errors'][0] and s['status']=='needs_review'

def test_private_url(monkeypatch):
    monkeypatch.setattr(socket,'getaddrinfo',lambda *a,**k:[(2,1,6,'',('127.0.0.1',443))])
    with pytest.raises(ValueError): public_url('http://localhost/test')

def test_citations():
    assert citation_errors('claim [S3]',[{'id':'S1'}])
    assert citation_errors('https://fake.example [S1]',[{'id':'S1'}])
    assert not citation_errors('claim [S1]',[{'id':'S1'}])

def test_inputs():
    with pytest.raises(ValueError): initial_state(' ')
    assert canonical('https://Example.com/a#f')=='https://example.com/a'

def test_ollama_contract(monkeypatch):
    thoughts=[]
    def handle(req):
        if req.url.path=='/api/tags': return httpx.Response(200,json={'models':[{'name':'qwen3:8b'}]})
        payload=json.loads(req.content)
        assert payload['format']['type']=='object' and payload['stream'] is False
        return httpx.Response(200,json={'message':{'content':'{"tasks":["t"],"queries":["primary evidence"]}','thinking':'Choose primary evidence.'}})
    original=httpx.Client
    monkeypatch.setattr(httpx,'Client',lambda **kw:original(transport=httpx.MockTransport(handle),**kw))
    llm=OllamaLLM(Settings());llm.on_thinking=thoughts.append
    assert llm.health()==['qwen3:8b']
    assert llm.structured('test',Plan).queries==['primary evidence'] and thoughts
