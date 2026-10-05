# Validation

Tested on Python 3.12.

- 10 automated workflow tests passed, including the offline demo run (`python -m pytest -q`, October 5, 2026).
- Verified LangGraph retry, synthesis, critique, revision and finalization paths.
- Verified citation rejection, empty evidence, search exceptions, private URL blocking.
- Verified Ollama schema-output HTTP contract and reasoning capture using mock HTTP transport.
- Ran the CLI offline demonstration and verified Markdown/JSON exports.
- No Ollama server is available in this execution environment (connection refused); actual local model inference remains to be verified on your machine with --doctor and a real research query.
- Web availability varies; the supplied tests use deterministic fixtures and do not establish live search reliability.
- Ollama reasoning displays after a call completes, when returned by the selected model; stage decisions update as nodes finish.

Run `python -m pytest -q` to reproduce automated validation.
