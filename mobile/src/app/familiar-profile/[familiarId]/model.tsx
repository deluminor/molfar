import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { ModelList } from "@/features/models/ModelPicker";
import { familiarConversationId } from "@/features/workspace/WorkspaceProvider";

// The Familiar's model, picked from every provider's, pushed inside its profile
// rather than in a sheet of its own; searched from the header.
export default function FamiliarModelScreen() {
  const { familiarId } = useLocalSearchParams<{ familiarId: string }>();
  const [query, setQuery] = useState("");
  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: "Find a model",
            hideWhenScrolling: false,
            autoCapitalize: "none",
            onChangeText: (event) => setQuery(event.nativeEvent.text),
          },
        }}
      />
      <ModelList
        projectId=""
        sessionId={familiarConversationId(familiarId)}
        query={query}
        onOpenOptions={() =>
          router.push({ pathname: "/familiar-profile/[familiarId]/model-options", params: { familiarId } })
        }
      />
    </>
  );
}
