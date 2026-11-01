import { Redirect, router } from "expo-router";
import { useConnection } from "@/features/connection/ConnectionProvider";
import { readLastPlace } from "@/features/workspace/last-place";
import { Pressable, Text, View } from "react-native";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { SessionScreen } from "@/features/sessions/SessionScreen";
import { useConnectionStyles } from "@/features/connection/ConnectScreen";
export default function Index() {
  const styles = useConnectionStyles();
  const { projects, familiars } = useWorkspace();
  // Back where the user last was, while it is still on the phone.
  const last = readLastPlace(useConnection().pairing?.desktop.fingerprint);
  if (last?.kind === "project" && projects.some((project) => project.id === last.id))
    return (
      <Redirect href={{ pathname: "/project/[projectId]", params: { projectId: last.id } }} />
    );
  if (last?.kind === "familiar" && familiars.some((familiar) => familiar.id === last.id))
    return <Redirect href={{ pathname: "/familiar/[familiarId]", params: { familiarId: last.id } }} />;
  if (projects[0])
    return (
      <Redirect
        href={{
          pathname: "/project/[projectId]",
          params: { projectId: projects[0].id },
        }}
      />
    );
  if (familiars[0])
    return (
      <Redirect
        href={{ pathname: "/familiar/[familiarId]", params: { familiarId: familiars[0].id } }}
      />
    );
  return (
    <SessionScreen title="Workspace">
      <View style={[styles.screen, { justifyContent: "center", gap: 24 }]}>
        <Text style={styles.title}>Make yourself at home.</Text>
        <Text style={styles.subtitle}>
          Choose the projects and familiars you want on your phone.
        </Text>
        <Pressable
          style={styles.primary}
          onPress={() => router.push("/settings")}
        >
          <Text style={styles.primaryLabel}>Choose workspace</Text>
        </Pressable>
      </View>
    </SessionScreen>
  );
}
