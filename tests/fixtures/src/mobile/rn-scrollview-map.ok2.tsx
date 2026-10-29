import React from 'react';
import { Text, ScrollView } from 'react-native';
const CHIPS = ['All', 'Rings', 'Bags'];
export const A = () => (
  <ScrollView horizontal>{['All', 'Rings', 'Bags'].map((c) => <Text key={c}>{c}</Text>)}</ScrollView>
);
export const B = () => <ScrollView horizontal>{CHIPS.map((c) => <Text key={c}>{c}</Text>)}</ScrollView>;
