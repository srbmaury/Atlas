"""Question parsing and conservative connected-source search filters."""

import re

QUERY_STOPWORDS = {
    'what',
    'which',
    'where',
    'when',
    'why',
    'how',
    'can',
    'could',
    'would',
    'should',
    'you',
    'please',
    'search',
    'searching',
    'look',
    'looking',
    'find',
    'list',
    'show',
    'tell',
    'me',
    'about',
    'the',
    'and',
    'or',
    'from',
    'to',
    'of',
    'a',
    'an',
    'my',
    'their',
    'our',
    'this',
    'that',
    'it',
    'all',
    'in',
    'on',
    'for',
    'are',
    'is',
    'was',
    'were',
    'does',
    'did',
    'with',
    'give',
    'summarize',
    'summary',
    'latest',
    'recent',
    'recently',
    'exact',
    'file',
    'files',
    'name',
    'names',
    'source',
    'sources',
    'any',
    'there',
    'have',
    'google',
    'drive',
    'gmail',
    'github',
    'slack',
    'email',
    'emails',
    'contain',
    'contains',
    'containing',
    'focus',
    'kind',
    'kinds',
    'available',
    'content',
    'contents',
    'item',
    'items',
    'unique',
    'marker',
    'scenario',
    'next',
    'upcoming',
    'calendar',
    'event',
    'events',
    'meeting',
    'meetings',
    'appointment',
    'appointments',
    'schedule',
    'schedules',
    'date',
    'dates',
    'time',
    'times',
    'tomorrow',
    'yesterday',
    'detail',
    'details',
    'page',
    'pages',
    'workspace',
    'across',
    'connected',
    'document',
    'documents',
    'uploaded',
    'upload',
    # Writing and answer-format instructions should not become source-search
    # terms. Keep topic words and drop the request wrapper.
    'write',
    'writes',
    'writing',
    'wrote',
    'create',
    'draft',
    'compose',
    'generate',
    'answer',
    'response',
    'explain',
    'describe',
    'using',
    'use',
    'only',
    'selected',
    'concise',
    'brief',
    'short',
    'paragraph',
    'paragraphs',
    'sentence',
    'sentences',
    'words',
    'lines',
}

GITHUB_QUERY_STOPWORDS = {
    'issues',
    'pull',
    'request',
    'requests',
    'pr',
    'prs',
    'repo',
    'open',
    'active',
    'unmerged',
    'get',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'different',
    'types',
    'type',
    'projects',
    'project',
    'repositories',
    'repository',
    'repos',
    'describe',
    'overview',
    'portfolio',
    'updated',
}
SLACK_QUERY_STOPWORDS = {
    'team',
    'discuss',
    'discussed',
    'decision',
    'decisions',
    'cite',
    'messages',
    'message',
}
CALENDAR_QUERY_STOPWORDS = {
    'today',
    'tonight',
    'tomorrow',
    'yesterday',
    'next',
    'upcoming',
    'soon',
}


def natural_search_terms(question, *, extra_stopwords=()):
    requested_counts = {
        match.group(1).lower()
        for match in re.finditer(
            r'\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+'
            r'(?:events?|appointments?|meetings?|messages?|emails?|documents?|files?|results?|items?)\b',
            question,
            re.I,
        )
    }
    terms = []
    for word in re.findall(r'[A-Za-z0-9_+.#-]{2,}', question):
        word = word.strip('._-+#')
        if not word:
            continue
        lowered = word.lower()
        if (
            lowered not in QUERY_STOPWORDS
            and lowered not in extra_stopwords
            and lowered not in requested_counts
            and lowered not in terms
        ):
            terms.append(word.lower())
    return terms[:8]


def gmail_query_for_question(scope, question):
    terms = natural_search_terms(question)
    return ' '.join([scope.strip(), *terms]).strip()


def drive_query_for_question(question):
    return ' '.join(natural_search_terms(question))


def provider_query_terms(question, *, limit=8, extra_stopwords=()):
    """Return concise lexical terms for providers without a natural-language parser."""
    return natural_search_terms(question, extra_stopwords=extra_stopwords)[:limit]
