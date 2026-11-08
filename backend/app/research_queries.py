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
    'other',
    'else',
    'needs',
    'need',
    'attention',
    'mail',
    'mails',
    'may',
    'might',
    'possibly',
    'potentially',
    'related',
    'regarding',
    'cited',
    'evidence',
    'more',
    'further',
    'except',
    'excluding',
    'exclude',
    'without',
    'ones',
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


def email_request_scope(question):
    """Recognize explicit email-only requests independent of enabled connectors."""
    return bool(
        re.search(r'\\b(?:emails?|mails?|inbox)\\b', question, re.I)
        and re.search(
            r'\\b(?:list|show|find|search|summarize|summary|important|unread|which|what|any)\\b',
            question,
            re.I,
        )
    )


def excluded_mail_sender(question):
    """An excluded provider name in an email request denotes a sender, not a source."""
    match = re.search(
        r'\\b(?:exclud(?:e|ing)|except|without|other than)\\s+'
        r'(?:(?:the|all|any)\\s+)?'
        r'(github|gitlab|linkedin|facebook|amazon|google|microsoft)\\b'
        r'(?:\\s+(?:emails?|mails?|ones|notifications?))?',
        question,
        re.I,
    )
    return match.group(1).lower() if match else None


def excludes_gmail_messages(question):
    """An email request excluding Gmail itself is ambiguous, not a Drive query."""
    return bool(
        re.search(
            r'\\b(?:exclud(?:e|ing)|except|without|other than)\\s+'
            r'(?:(?:the|all|any)\\s+)?gmail\\b',
            question,
            re.I,
        )
    )


def gmail_query_for_question(scope, question):
    """Translate common mailbox intents into Gmail operators, not literal words."""
    text = question.lower()
    filters = []
    excluded_sender = excluded_mail_sender(question)
    if excluded_sender:
        filters.append('-from:' + excluded_sender)
    # Gmail importance is a provider flag, not a semantic ranking of significance.
    if re.search(r'\bimportant\b', text):
        filters.append('is:important')
    if re.search(r'\bunread\b', text):
        filters.append('is:unread')
    relative = re.search(r'\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b', text)
    if relative:
        filters.append(f'newer_than:{relative.group(1)}d')
    elif re.search(r'\b(?:last|past|previous)\s+week\b', text):
        filters.append('newer_than:7d')
    elif re.search(r'\b(?:last|past|previous)\s+month\b', text):
        filters.append('newer_than:30d')
    cleaned = re.sub(r'\b(?:last|past|previous)\s+(?:\d{1,3}\s+days?|week|month)\b', ' ', text)
    cleaned = re.sub(r'\b(?:important|unread|mails?|emails?|messages?)\b', ' ', cleaned)
    # A follow-up asking for other mail must not inherit an unrelated
    # sender/topic constraint from the previous question.
    if re.search(r'\b(?:any|what|which)\s+other\b', text) and re.search(
        r'\b(?:emails?|mails?|messages?)\b', text
    ):
        return ' '.join([scope.strip(), *filters]).strip()
    # "from CoinDCX" is a sender filter, not a free-text conjunction.
    sender = re.search(r'\bfrom\s+([a-z][a-z0-9._+-]{1,70})\b', cleaned)
    if sender:
        filters.append('from:' + sender.group(1))
        cleaned = re.sub(r'\bfrom\s+' + re.escape(sender.group(1)) + r'\b', ' ', cleaned)
    terms = natural_search_terms(cleaned)
    terms = [
        term
        for term in terms
        if term not in {'last', 'past', 'previous', 'days', 'day', 'week', 'month'}
    ]
    return ' '.join([scope.strip(), *filters, *terms]).strip()


def drive_query_for_question(question):
    return ' '.join(natural_search_terms(question))


def provider_query_terms(question, *, limit=8, extra_stopwords=()):
    """Return concise lexical terms for providers without a natural-language parser."""
    return natural_search_terms(question, extra_stopwords=extra_stopwords)[:limit]
