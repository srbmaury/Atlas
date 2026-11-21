"""Score versioned retrieval judgments from JSON, without contacting an AI provider.

Usage: PYTHONPATH=backend python ops/evaluate_retrieval.py examples/retrieval-eval.json --k 5
Input schema: {"cases":[{"query":"...","relevant_ids":["id"],"ranked_ids":["id"]}]}
Ranked IDs must come from a real retrieval run; this script does not run retrieval.
"""

import argparse
import json
from pathlib import Path

from app.research.retrieval_metrics import RetrievalCase, evaluate


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('dataset', type=Path)
    parser.add_argument('--k', type=int, default=10)
    parser.add_argument('--min-recall', type=float, default=None)
    args = parser.parse_args()
    raw = json.loads(args.dataset.read_text(encoding='utf-8'))
    cases = [
        RetrievalCase(
            query=case['query'],
            relevant_ids=frozenset(str(x) for x in case['relevant_ids']),
            ranked_ids=tuple(str(x) for x in case['ranked_ids']),
        )
        for case in raw['cases']
    ]
    results = evaluate(cases, k=args.k)
    print(json.dumps(results, indent=2))
    if args.min_recall is not None:
        recall = results['recall_at_k']
        if recall is None or recall < args.min_recall:
            raise SystemExit(1)


if __name__ == '__main__':
    main()
