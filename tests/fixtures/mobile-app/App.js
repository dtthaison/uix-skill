import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';

// Two screens chosen by the deep-link path: "/" is home, "/second" is visually different.
// No router on purpose; the fixture only needs useURL().
function screenFor(url) {
  const path = url ? Linking.parse(url).path ?? '' : '';
  return path.replace(/^\/+|\/+$/g, '') === 'second' ? 'second' : 'home';
}

export default function App() {
  const url = Linking.useURL();
  if (screenFor(url) === 'second') {
    return (
      <View style={[styles.fill, { backgroundColor: '#14213d' }]}>
        <Text style={[styles.title, { color: '#fca311' }]}>Second screen</Text>
        <Text style={{ color: '#e5e5e5', fontSize: 18 }}>A different page with a dark background.</Text>
      </View>
    );
  }
  return (
    <View style={[styles.fill, { backgroundColor: '#ffffff' }]}>
      <Text style={styles.title}>Home screen</Text>
      <Text style={styles.body}>Welcome to the fixture app.</Text>
      <Pressable style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'flex-start', justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: '700', color: '#111111', marginBottom: 12 },
  body: { fontSize: 18, color: '#333333', marginBottom: 24 },
  dot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#e63946' },
});
