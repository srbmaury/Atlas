# Atlas retrieval evaluation

Run from the repository root after installing backend requirements:

```sh
PYTHONPATH=backend python evals/retrieval_eval.py evals/retrieval_cases.json --k 5
```

The checked-in fixture contains realistic-shaped but synthetic questions, relevant
passages, and hard negatives across product, backend, security, operations, data,
and workflow topics. It is a repeatable regression set, not a claim that labels
represent production traffic. Review and extend labels whenever retrieval behavior
or source coverage changes.

Metrics: recall@k, precision@k, MRR@k, nDCG@k, and hit-rate@k. The current ranker
is the production BM25 implementation run without a database. This fixture does
not measure embedding quality, live connector recall, answer generation, or
semantic citation entailment. Do not derive production quality claims from this
synthetic set alone.

For a release-quality benchmark, add consented/de-identified real questions,
independently reviewed relevance judgments, connector-specific slices, multiple
relevant passages where appropriate, and a held-out set. Report per-slice metrics
and confidence intervals; do not tune against held-out questions. Citation
auditing remains heuristic and every claim requires human review.

Historical document Q&A results are kept in `results/`. Rebuild their
interactive HTML report with `python evals/render.py` from the repository root.
