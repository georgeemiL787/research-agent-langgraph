# Validation

Historical validation on Python 3.12. The test suite was removed from the repository at the owner's request after these checks.

- Before removal, 10 automated workflow tests passed, including the offline demo run (October 5, 2026).
- Verified LangGraph retry, synthesis, critique, revision and finalization paths.
- Verified citation rejection, empty evidence, search exceptions, private URL blocking.
- Verified Ollama schema-output HTTP contract and reasoning capture using mock HTTP transport.
- Ran the CLI offline demonstration and verified Markdown/JSON exports.
- No Ollama server is available in this execution environment (connection refused); actual local model inference remains to be verified on your machine with --doctor and a real research query.
- Web availability varies; the former tests used deterministic fixtures and did not establish live search reliability.
- Ollama reasoning displays after a call completes, when returned by the selected model; stage decisions update as nodes finish.

The former automated test suite is available in Git history.
