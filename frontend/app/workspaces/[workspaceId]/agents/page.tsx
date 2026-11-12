import { AtlasWorkspace } from '../../../../components/AtlasWorkspace';

export default async function AgentStudioRoute({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params;
    return <AtlasWorkspace initialTab="agents" initialWorkspaceId={workspaceId} />;
}
