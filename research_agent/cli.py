import argparse
import sys
from .runner import run, components

def main():
    p=argparse.ArgumentParser(description="Local LangGraph research agent")
    p.add_argument("question",nargs="?")
    p.add_argument("--demo",action="store_true")
    p.add_argument("--doctor",action="store_true",help="Check Ollama model availability")
    args=p.parse_args()
    try:
        if args.doctor:
            cfg,llm,_=components(args.demo); print("Models:",llm.health()); print("Configured model:",cfg.model); return
        if not args.question: p.error("provide a question or --doctor")
        state,folder=run(args.question,args.demo,lambda event,state:print(event,flush=True))
        print(state['report']); print("Saved:",folder.resolve())
    except Exception as exc:
        print(f"Research failed: {type(exc).__name__}: {exc}",file=sys.stderr); sys.exit(1)
if __name__ == "__main__": main()
