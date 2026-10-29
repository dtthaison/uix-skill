import React from 'react';
import { Text, ScrollView } from 'react-native';
export const A = ({ items }) => <ScrollView>{items.slice(0, 6).map((i) => <Text key={i}>{i}</Text>)}</ScrollView>;
export const B = ({ items }) => <ScrollView>{items.slice(0,12).map((i) => <Text key={i}>{i}</Text>)}</ScrollView>;
