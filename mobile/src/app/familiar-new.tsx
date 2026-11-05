import * as Haptics from "expo-haptics";
import { router, Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useConnection } from "@/features/connection/ConnectionProvider";
import { PixelMascot } from "@/features/mascots/PixelMascot";
import { PIXEL_MASCOT_NAMES } from "@/features/mascots/pixelMascots";
import { SWATCHES } from "../features/workspace/familiar-look";
import { familiarCreated } from "../features/workspace/new-familiar";
import { HeaderBlur, HeaderButton } from "@/features/files/codeScreen";
import { GradualBlur } from "@/ui/GradualBlur";
import { useColors, useScheme } from "@/ui/theme";

import { COLUMNS, TILE_GAP, BUTTON_HEIGHT, FOOT_FADE, pick } from "@/features/workspace/familiar-new/constants";
import { useStyles } from "@/features/workspace/familiar-new/styles";

// A new Familiar, made in one go as a messaging app makes a contact: its look
// picked here, a name given, then Create makes it on the desktop with that
// look and opens its chat. Opened from + on the Familiar list and in the drawer.
export default function NewFamiliarScreen() {
  const { command, refresh, selection, select } = useConnection();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const colors = useColors();
  const scheme = useScheme();
  const [name, setName] = useState("");
  // A fresh look each time, for the user to keep or change.
  const [mascot, setMascot] = useState(() => pick(PIXEL_MASCOT_NAMES));
  const [color, setColor] = useState(() => pick(SWATCHES));
  const [creating, setCreating] = useState(false);
  // Five square tiles to a row, sized to the grid's width.
  const [gridWidth, setGridWidth] = useState(0);
  const tile = gridWidth > 0 ? Math.floor((gridWidth - TILE_GAP * (COLUMNS - 1)) / COLUMNS) : 0;
  const ready = name.trim().length > 0 && !creating;

  const create = async () => {
    if (!ready) return;
    setCreating(true);
    try {
      const { familiarId } = await command<{ familiarId: string }>("familiar.create");
      await command("familiar.update", { familiarId, name: name.trim(), mascot, color });
      // Shown on this phone at once.
      if (selection) await select({ ...selection, familiarIds: [...selection.familiarIds, familiarId] });
      await refresh();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // The sheet goes, and the screen under it opens the new Familiar's chat.
      router.back();
      familiarCreated(familiarId);
    } catch (reason) {
      setCreating(false);
      Alert.alert(
        "Couldn’t create a Familiar",
        reason instanceof Error ? reason.message : String(reason),
      );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        // Clear of the native header, which it scrolls under.
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: BUTTON_HEIGHT + Math.max(insets.bottom, 16) + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.preview}>
          <PixelMascot name={mascot} color={color} size={120} centered />
        </View>

        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={40}
          placeholder="Name your Familiar"
          placeholderTextColor={colors.muted}
          keyboardAppearance={scheme}
          returnKeyType="done"
          onSubmitEditing={() => void create()}
          editable={!creating}
          style={styles.input}
        />

        <View
          style={styles.grid}
          onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
        >
          {tile > 0 &&
            PIXEL_MASCOT_NAMES.map((option) => {
              const selected = option === mascot;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={option}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    if (selected) return;
                    void Haptics.selectionAsync();
                    setMascot(option);
                  }}
                  style={[
                    styles.tile,
                    { width: tile, height: tile },
                    selected && { borderColor: colors.muted },
                  ]}
                >
                  <PixelMascot name={option} color={color} size={Math.round(tile * 0.6)} centered />
                </Pressable>
              );
            })}
        </View>

        <View style={styles.swatches}>
          {SWATCHES.map((swatch) => {
            const selected = swatch === color;
            return (
              <Pressable
                key={swatch}
                accessibilityRole="radio"
                accessibilityLabel={swatch}
                accessibilityState={{ selected }}
                hitSlop={4}
                onPress={() => {
                  if (selected) return;
                  void Haptics.selectionAsync();
                  setColor(swatch);
                }}
                style={[styles.ring, selected && { borderColor: colors.muted }]}
              >
                <View style={[styles.dot, { backgroundColor: swatch }]} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* The native header, transparent over the sheet as Settings' is,
          with close on the left. */}
      <Stack.Screen
        options={{
          title: "New Familiar",
          headerLeft: () => (
            <HeaderButton icon="close" label="Close" onPress={() => router.back()} />
          ),
        }}
      />

      {/* The same gradual blur under the header as every sheet, and one
          under the Create button for the content scrolling past it. */}
      <HeaderBlur color={colors.sheet} />
      <GradualBlur
        edge="bottom"
        height={BUTTON_HEIGHT + Math.max(insets.bottom, 16) + 12 + FOOT_FADE}
        color={colors.sheet}
      />

      <View style={[styles.foot, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={() => void create()}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: ready ? colors.content : colors.surface },
            pressed && styles.pressed,
          ]}
        >
          {creating ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={[styles.buttonLabel, { color: ready ? colors.background : colors.muted }]}>
              Create
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
