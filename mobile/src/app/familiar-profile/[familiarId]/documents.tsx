import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { SettingsPage } from "@/features/settings/SettingsUI";
import { FamiliarDocumentRows } from "@/features/workspace/FamiliarDocuments";
import { useFamiliarProfile } from "../../../features/workspace/familiar-profile";
import { radii, themedStyles, useColors } from "@/ui/theme";

// Every document a Familiar wrote, newest first, from "See all" under the few its
// profile shows. Each opens beside it, inside the profile's sheet.
export default function FamiliarDocumentsScreen() {
  const { familiarId } = useLocalSearchParams<{ familiarId: string }>();
  const { profile, error, refreshing, refresh } = useFamiliarProfile(familiarId);
  const styles = useStyles();
  const colors = useColors();
  return (
    <SettingsPage onRefresh={refresh} refreshing={refreshing}>
      {profile ? (
        <View style={styles.card}>
          <FamiliarDocumentRows familiarId={familiarId} documents={profile.documents} />
        </View>
      ) : error ? (
        <Text style={styles.note}>{error}</Text>
      ) : (
        <ActivityIndicator color={colors.muted} style={styles.loading} />
      )}
    </SettingsPage>
  );
}

const useStyles = themedStyles((colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderCurve: "continuous",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  note: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginHorizontal: 16,
  },
  loading: {
    marginTop: 32,
  },
}));
