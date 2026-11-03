import { router, Stack } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from "react-native-reanimated";
import { hideScrollEdgeEffects } from "@/features/connection/nativeLink";
import { HeaderBlur } from "@/features/files/codeScreen";
import { MOLFAR_MARK } from "@/ui/brand";
import { CircleButton } from "@/ui/CircleButton";
import { GradualBlur } from "@/ui/GradualBlur";
import { Icon } from "@/ui/Icon";
import { LiquidView } from "@/ui/LiquidView";
import { FamiliarRow } from "./FamiliarRow";
import { useFamiliarHome } from "./use-familiar-home";
import { LIST_ID, FOOTER_HEIGHT, FADE, MOVE_MS, FADE_OUT_MS } from "./constants";

export function FamiliarHome() {
  const { styles, colors, listReady, setListReady, footerTop, familiars, unread, focused, tools, actions, needle, covered, footerBottom, lift, search, query, setQuery, scheme } = useFamiliarHome();

  return (
    <View style={styles.container}>
      {/* First, so it leads the screen's first-child chain: that is where
          iOS looks for the scroll view whose edge effect is turned off
          under the header, leaving our own gradual blur. */}
      <ScrollView
        testID={LIST_ID}
        onLayout={listReady ? undefined : () => setListReady(true)}
        onScrollBeginDrag={() => hideScrollEdgeEffects(LIST_ID)}
        style={StyleSheet.absoluteFill}
        // Clear of the native header, which it runs under, and of the foot.
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingTop: 4, paddingBottom: footerTop + FADE }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Rows glide to their new places as one leaves or a new message
            brings one to the top, and fade as they go or come; the first
            ones in are simply there. */}
        <LayoutAnimationConfig skipEntering>
          {familiars.map((familiar) => (
            <Animated.View
              key={familiar.id}
              layout={LinearTransition.duration(MOVE_MS)}
              entering={FadeIn.duration(MOVE_MS)}
              exiting={FadeOut.duration(FADE_OUT_MS)}
            >
              <FamiliarRow
                familiar={familiar}
                unread={unread.has(familiar.id)}
                shown={focused}
                tools={tools}
                actions={actions}
              />
            </Animated.View>
          ))}
        </LayoutAnimationConfig>
        {familiars.length ? null : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {needle ? "Nothing matches." : "No Familiars on this phone yet."}
            </Text>
            {needle ? null : (
              <Text style={styles.emptyLink} onPress={() => router.push("/settings/workspace")}>
                Choose Familiars
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* The stack's native header: the MOLFAR mark and a new Familiar as
          native items, so they morph into a chat's back and ⋯ as one is
          pushed. */}
      <Stack.Screen options={{ headerTitle: "" }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View hidesSharedBackground>
          <View style={styles.markBox}>
            <Image
              source={MOLFAR_MARK}
              style={[styles.mark, { tintColor: colors.content }]}
              accessibilityLabel="MOLFAR"
              accessibilityIgnoresInvertColors
            />
          </View>
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      {/* The older desktop app can't make a Familiar from the phone. */}
      {tools ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="plus"
            accessibilityLabel="New Familiar"
            onPress={() => router.push("/familiar-new")}
          />
        </Stack.Toolbar>
      ) : null}

      {/* The app's own gradual blur under the header and the foot, as
          over every screen, rather than iOS's edge effects. Not kept while
          a chat covers the list: its masked layers are rebuilt each time
          iOS takes the list off screen or puts it back, which stalls the
          slides in and out of a chat. */}
      {covered ? null : (
        <>
          <HeaderBlur color={colors.background} />
          <GradualBlur edge="bottom" height={footerTop + FADE} color={colors.background} />
        </>
      )}

      <Animated.View style={[styles.foot, { bottom: footerBottom }, lift]}>
        <View style={styles.footer}>
          <CircleButton
            icon="settings"
            label="Settings"
            onPress={() => router.push("/settings")}
            size={FOOTER_HEIGHT}
          />
          <LiquidView
            borderRadius={FOOTER_HEIGHT / 2}
            style={styles.searchFrame}
            innerStyle={styles.search}
          >
            <Icon name="search" size={18} color={colors.muted} />
            <TextInput
              ref={search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={colors.muted}
              keyboardAppearance={scheme}
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="while-editing"
              style={styles.searchInput}
            />
          </LiquidView>
        </View>
      </Animated.View>
    </View>
  );
}
