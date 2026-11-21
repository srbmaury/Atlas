'use client';
import { useRef, useState } from 'react';
import type { GmailStatus, GmailMessage, GmailSummary, GmailThread } from '../../../lib/types';

/** Gmail search, selection, preview and summary state. */
export function useGmailWorkspace() {
    const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
    const [gmailMessages, setGmailMessages] = useState<GmailMessage[]>([]);
    const [gmailThreads, setGmailThreads] = useState<GmailThread[]>([]);
    const [gmailActiveThread, setGmailActiveThread] = useState<string | null>(null);
    const [gmailFollowUp, setGmailFollowUp] = useState('');
    const [gmailQuery, setGmailQuery] = useState('in:inbox newer_than:30d');
    const [gmailSummarizeQuery, setGmailSummarizeQuery] = useState('');
    const [gmailQueryLimit, setGmailQueryLimit] = useState(30);
    const [gmailQuerySummaryLabel, setGmailQuerySummaryLabel] = useState('');
    const [gmailSelected, setGmailSelected] = useState<string[]>([]);
    const [gmailIntelligence, setGmailIntelligence] = useState(false);
    const [gmailSummary, setGmailSummary] = useState<GmailSummary | null>(null);
    const [gmailBusy, setGmailBusy] = useState(false);
    const [gmailSummarizing, setGmailSummarizing] = useState(false);
    const [gmailSummaryIds, setGmailSummaryIds] = useState<string[]>([]);
    const [gmailMobileView, setGmailMobileView] = useState<'emails' | 'summary'>('emails');
    const [gmailPreview, setGmailPreview] = useState<GmailMessage | null>(null);
    const gmailSummaryHeading = useRef<HTMLHeadingElement>(null);
    return {
        gmailStatus,
        setGmailStatus,
        gmailMessages,
        gmailThreads,
        setGmailThreads,
        gmailActiveThread,
        setGmailActiveThread,
        gmailFollowUp,
        setGmailFollowUp,
        setGmailMessages,
        gmailQuery,
        setGmailQuery,
        gmailSummarizeQuery,
        setGmailSummarizeQuery,
        gmailQueryLimit,
        setGmailQueryLimit,
        gmailQuerySummaryLabel,
        setGmailQuerySummaryLabel,
        gmailSelected,
        gmailIntelligence,
        setGmailIntelligence,
        setGmailSelected,
        gmailSummary,
        setGmailSummary,
        gmailBusy,
        setGmailBusy,
        gmailSummarizing,
        setGmailSummarizing,
        gmailSummaryIds,
        setGmailSummaryIds,
        gmailMobileView,
        setGmailMobileView,
        gmailPreview,
        setGmailPreview,
        gmailSummaryHeading,
    };
}
