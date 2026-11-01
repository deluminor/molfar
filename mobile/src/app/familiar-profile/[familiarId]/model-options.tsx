import { useLocalSearchParams } from "expo-router";

import { ModelOptions } from "@/features/models/ModelPicker";
import { familiarConversationId } from "@/features/workspace/WorkspaceProvider";

// The Familiar's model options and access, pushed from its model list.
export default function FamiliarModelOptionsScreen() {
  const { familiarId } = useLocalSearchParams<{ familiarId: string }>();
  return <ModelOptions projectId="" sessionId={familiarConversationId(familiarId)} />;
}
