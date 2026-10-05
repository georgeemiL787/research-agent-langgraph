from .schemas import Strategy, Plan, Assessment, Rating, ReviewDecision

class DemoLLM:
    def __init__(self): self.plans=0
    def health(self): return ["offline-demo"]
    def structured(self,prompt,schema):
        if schema is Strategy:
            return Strategy(strategy="in_depth", scope="test scope", evidence_requirements="test evidence", stop_conditions="test conditions")
        if schema is Plan:
            self.plans+=1
            return Plan(tasks=["test task 1"], queries=[f"example research evidence round {self.plans}"])
        if schema is Assessment:
            return Assessment(ratings=[Rating(source_id=f"S{i}",score=0.9,relevant=True,
                reason="Synthetic fixture; not real-world evidence") for i in range(1,10)],
                sufficient=self.plans>=2,gaps=[] if self.plans>=2 else ["Need independent corroboration"])
        if schema is ReviewDecision:
            return ReviewDecision(decision="finish" if self.plans>=2 else "research_more", reasons=[])
        return schema()
        
    def generate(self,prompt,schema=None):
        return "## Offline demonstration\nThis is synthetic evidence demonstrating the workflow, not a real research result. [S1] [S2]\n\n## Limitations\nReplace demo mode with Ollama and web search for real research."

class DemoSearch:
    def search(self,q,limit):
        return [{"title":"Synthetic fixture A","url":"https://example.com/research","snippet":"Synthetic"},
                {"title":"Synthetic fixture B","url":"https://example.org/research","snippet":"Synthetic"}][:limit]
    def fetch(self,url): return "Synthetic evidence for deterministic workflow testing. "*10,""
