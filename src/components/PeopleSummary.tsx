import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { createThemedStyles } from '../theme/theme';
import { MemberAvatar } from './MemberAvatar';

export function PeopleSummary({ people, showAvatar = true, textStyle, selectable, decorative, wrap, wrapAlignEnd }: {
  people: { id: string; name: string; photoURL?: string | null }[];
  showAvatar?: boolean;
  textStyle?: StyleProp<TextStyle>;
  selectable?: boolean;
  decorative?: boolean;
  wrap?: boolean;
  wrapAlignEnd?: boolean;
}) {
  const styles = useStyles();
  const [summaryWidth, setSummaryWidth] = useState(0);
  const [namesWidth, setNamesWidth] = useState(0);
  const renderPeople = (singleLine = false) => people.map((person, index) =>
    <View key={person.id} style={[styles.person, wrap && styles.wrappedPerson]}>
      {showAvatar && person.id ? <MemberAvatar name={person.name} photoURL={person.photoURL} compact /> : null}
      <Text numberOfLines={singleLine ? 1 : undefined} selectable={selectable}
        style={[styles.text, textStyle, (wrap || singleLine) && styles.shrinkName]}>
        {person.name}{index < people.length - 1 ? ',' : ''}
      </Text>
    </View>);

  if (wrap) return <View style={[styles.summary, styles.names, styles.wrap, wrapAlignEnd && styles.wrapEnd]}>{renderPeople()}</View>;
  if (people.length === 1) {
    return <View aria-hidden={decorative} pointerEvents={decorative ? 'none' : undefined}
      style={styles.summary}>
      {renderPeople(true)}
    </View>;
  }

  return <View aria-hidden={decorative} pointerEvents={decorative ? 'none' : undefined} style={styles.summary}
    onLayout={event => setSummaryWidth(event.nativeEvent.layout.width)}>
    <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}
      onContentSizeChange={width => setNamesWidth(width)} contentContainerStyle={styles.names}>
      {renderPeople()}
    </ScrollView>
    {namesWidth > summaryWidth + 1 && <Text aria-hidden style={[styles.text, textStyle, styles.ellipsis]}>…</Text>}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  summary: { flex: 1, minWidth: 0, overflow: 'hidden' },
  names: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wrap: { flexWrap: 'wrap' },
  wrapEnd: { justifyContent: 'flex-end' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  wrappedPerson: { maxWidth: '100%' },
  text: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  shrinkName: { minWidth: 0, flexShrink: 1 },
  ellipsis: { position: 'absolute', right: 0, top: 0, bottom: 0, textAlignVertical: 'center',
    paddingLeft: 3, backgroundColor: colors.paper },
}));
