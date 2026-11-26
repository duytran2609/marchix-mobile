import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { dateInVietnam } from '../features/tasks/taskDates';
import { useTheme } from '../theme/theme';

const vietnamHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hourCycle: 'h23',
});
const labels = { morning: 'Chào buổi sáng', afternoon: 'Chào buổi chiều', evening: 'Chào buổi tối' };
type Period = keyof typeof labels;

// Vietnamese translations, with a source for each original.
const quotes = [
  // https://www.afb.org/blog/entry/happy-birthday-helen
  { text: 'Một mình ta làm được ít. Cùng nhau, ta làm được nhiều.', author: 'Helen Keller' },
  // https://www.trlibrary.com/tr/fake-quotes
  { text: 'Hãy làm điều có thể, với những gì đang có, ngay nơi mình đứng.', author: 'Squire Bill Widener' },
  // https://www.gutenberg.org/files/36151/36151-h/36151-h.htm
  { text: 'Làm tốt còn hơn nói hay.', author: 'Benjamin Franklin' },
  // https://www.gutenberg.org/files/6920/6920-h/6920-h.htm (Book V, section 20)
  { text: 'Trở ngại trên đường cũng có thể giúp ta tiến bước.', author: 'Marcus Aurelius' },
  // https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_1
  { text: 'Hãy nắm lấy từng giờ mình có.', author: 'Seneca' },
  // https://www.amnesty.org/en/wp-content/uploads/2021/05/NWS2186162018ENGLISH.pdf
  { text: 'Chỉ sợ đứng yên, đừng sợ đi chậm.', author: 'Tục ngữ Trung Quốc' },
  // https://ctext.org/text.pl?if=en&node=278905&remap=gb (Daodejing, chapter 64)
  { text: 'Cẩn thận đến phút cuối như lúc bắt đầu, việc sẽ ít hỏng.', author: 'Lão Tử' },
];
const dayMs = 86_400_000;

function shuffleQuotes(week: number) {
  const order = [...quotes];
  // Seed the shuffle by calendar week so the order survives app reloads.
  let seed = Math.imul(week, 0x9e3779b9);
  for (let index = order.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    const swap = Math.floor(seed / 0x100000000 * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

export function overviewQuote(now: Date) {
  const date = new Date(dateInVietnam(now));
  const weekday = (date.getUTCDay() + 6) % 7; // Monday is day zero.
  const monday = date.getTime() / dayMs - weekday;
  const order = shuffleQuotes(monday);
  // Swapping the first two leaves Sunday's quote intact for the next week's check.
  if (order[0] === shuffleQuotes(monday - 7)[quotes.length - 1]) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order[weekday];
}

export function overviewGreetingTime(now: Date): { period: Period; delay: number; midnightDelay: number } {
  const hour = Number(vietnamHour.format(now));
  const period = hour < 5 || hour >= 18 ? 'evening' : hour < 12 ? 'morning' : 'afternoon';
  const nextHour = period === 'morning' ? 12 : period === 'afternoon' ? 18 : hour >= 18 ? 24 + 5 : 5;
  const elapsedInHour = now.getUTCMinutes() * 60_000 + now.getUTCSeconds() * 1_000 + now.getUTCMilliseconds();
  return {
    period,
    delay: (nextHour - hour) * 3_600_000 - elapsedInHour,
    midnightDelay: (24 - hour) * 3_600_000 - elapsedInHour,
  };
}

function greetingSnapshot(now: Date) {
  const { period, delay, midnightDelay } = overviewGreetingTime(now);
  return { period, quote: overviewQuote(now), delay: Math.min(delay, midnightDelay) };
}

const lightScenes = {
  morning: { sky: '#FFF1E5', border: '#F1D5BD', ink: '#452619', name: '#873F26', muted: '#674839',
    light: '#F9B76A', glow: '#FBD8A9', cloud: '#FFFBF3', hill: '#F4C5A1', foreground: '#EEA883' },
  afternoon: { sky: '#E9F6F5', border: '#CCE8E4', ink: '#173938', name: '#1B5C56', muted: '#375C59',
    light: '#F5CD74', glow: '#F7E7B5', cloud: '#FCFFFF', hill: '#A9D8D2', foreground: '#82BEB6' },
};
const darkScenes = {
  morning: { sky: '#39251F', border: '#654236', ink: '#FFF1E6', name: '#FFD0A8', muted: '#F1CAAF',
    light: '#F3A869', glow: '#80503C', cloud: '#735147', hill: '#774435', foreground: '#9D5941' },
  afternoon: { sky: '#173333', border: '#2F5654', ink: '#E8FCF9', name: '#A9E7DD', muted: '#C2E2DE',
    light: '#F6CD78', glow: '#6C6444', cloud: '#446B68', hill: '#2D6560', foreground: '#3B8178' },
};
const eveningScene = { sky: '#222341', border: '#434468', ink: '#F7F2FF', name: '#DCD0FF', muted: '#D2CCE8',
  light: '#F4DBAA', glow: '#3C3A61', cloud: '#514E77', hill: '#3A4168', foreground: '#505781' };
type Scene = typeof eveningScene;

function GreetingArtwork({ period, scene }: { period: Period; scene: Scene }) {
  const [progress] = useState(() => new Animated.Value(1));
  const high = period !== 'morning';
  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    function updateMotion(reduced: boolean) {
      animation?.stop();
      progress.setValue(reduced ? 1 : 0);
      if (!reduced) {
        animation = Animated.timing(progress, {
          toValue: 1, duration: 760, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web',
        });
        animation.start();
      }
    }
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', updateMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (active) updateMotion(reduced);
    }).catch(() => {});
    return () => {
      active = false;
      subscription?.remove();
      animation?.stop();
    };
  }, [progress]);

  return <View aria-hidden accessible={false} importantForAccessibility="no-hide-descendants"
    pointerEvents="none" style={styles.artwork}>
    <Animated.View style={[StyleSheet.absoluteFill, {
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
      transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
    }]}>
      <View style={[styles.glow, high && styles.highGlow, { backgroundColor: scene.glow }]} />
      <View style={[styles.orb, high && styles.highOrb, { backgroundColor: scene.light }]} />
      {period === 'evening' ? <>
        <View style={[styles.moonCutout, { backgroundColor: scene.glow }]} />
        <Text style={[styles.star, styles.leftStar, { color: scene.light }]}>✦</Text>
        <Text style={[styles.star, styles.rightStar, { color: scene.light }]}>✦</Text>
        <View style={[styles.smallStar, { backgroundColor: scene.light }]} />
      </> : <>
        <View style={[styles.cloud, styles.leftCloud, { backgroundColor: scene.cloud }]} />
        <View style={[styles.cloud, styles.rightCloud, { backgroundColor: scene.cloud }]} />
      </>}
    </Animated.View>
    <View style={[styles.hill, { backgroundColor: scene.hill }]} />
    <View style={[styles.foreground, { backgroundColor: scene.foreground }]} />
  </View>;
}

export function OverviewGreeting({ name, email }: { name: string; email: string }) {
  const { dark } = useTheme();
  const [{ period, quote }, setGreeting] = useState(() => greetingSnapshot(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      clearTimeout(timer);
      const greeting = greetingSnapshot(new Date());
      setGreeting(greeting);
      timer = setTimeout(refresh, greeting.delay);
    }
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);

  const displayName = typeof name === 'string' ? name.trim() : '';
  const hasName = displayName && displayName !== email;
  const label = labels[period];
  const scene = period === 'evening' ? eveningScene : (dark ? darkScenes : lightScenes)[period];
  return <View style={[styles.banner, { backgroundColor: scene.sky, borderColor: scene.border }]}>
    <GreetingArtwork key={period} period={period} scene={scene} />
    <Text accessibilityRole="header" style={[styles.greeting, { color: scene.ink }]}>
      {hasName ? <>{label}{', '}<Text style={[styles.name, { color: scene.name }]}>{displayName}</Text>!</> : `${label}!`}
    </Text>
    <Text style={[styles.suggestion, { color: scene.muted }]}>Chọn một việc quan trọng hôm nay và bắt đầu từ bước nhỏ nhất.</Text>
    <View testID="overview-daily-quote" style={[styles.quote, { borderLeftColor: scene.name }]}>
      <Text style={[styles.quoteText, { color: scene.ink }]}>“{quote.text}”</Text>
      <Text style={[styles.quoteAuthor, { color: scene.muted }]}>{quote.author}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  banner: { minHeight: 134, justifyContent: 'center', paddingLeft: 20, paddingRight: 90, paddingVertical: 22,
    borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  artwork: { position: 'absolute', right: -12, bottom: 0, width: 160, height: 134 },
  glow: { position: 'absolute', right: 18, bottom: 11, width: 86, height: 86, borderRadius: 43 },
  highGlow: { bottom: 39 },
  orb: { position: 'absolute', right: 35, bottom: 28, width: 52, height: 52, borderRadius: 26 },
  highOrb: { bottom: 56 },
  moonCutout: { position: 'absolute', right: 27, bottom: 68, width: 48, height: 48, borderRadius: 24 },
  star: { position: 'absolute', fontSize: 15, lineHeight: 18 },
  leftStar: { right: 97, bottom: 91 },
  rightStar: { right: 26, bottom: 46, fontSize: 12 },
  smallStar: { position: 'absolute', right: 32, bottom: 107, width: 4, height: 4, borderRadius: 2 },
  cloud: { position: 'absolute', height: 11, borderRadius: 8 },
  leftCloud: { right: 84, bottom: 53, width: 46, transform: [{ rotate: '-7deg' }] },
  rightCloud: { right: 14, bottom: 46, width: 38, transform: [{ rotate: '-7deg' }] },
  hill: { position: 'absolute', right: -30, bottom: -45, width: 174, height: 82, borderRadius: 90,
    transform: [{ rotate: '-13deg' }] },
  foreground: { position: 'absolute', right: -15, bottom: -60, width: 177, height: 83, borderRadius: 89,
    transform: [{ rotate: '10deg' }] },
  greeting: { fontSize: 28, lineHeight: 36, fontWeight: '400', width: '100%', flexShrink: 1 },
  name: { fontWeight: '800' },
  suggestion: { marginTop: 8, fontSize: 15, lineHeight: 22 },
  quote: { marginTop: 12, gap: 3, borderLeftWidth: 2, paddingLeft: 10 },
  quoteText: { fontSize: 14, lineHeight: 21, fontStyle: 'italic', fontWeight: '500' },
  quoteAuthor: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
});
