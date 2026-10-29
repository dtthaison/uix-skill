import React from 'react';
import { View, Text, ScrollView, FlatList, Pressable, Animated } from 'react-native';
export const A = ({ items }) => <FlatList data={items} renderItem={({ item }) => <Text>{item}</Text>} />;
export const B = ({ items }) => items.map((i) => <Text key={i}>{i}</Text>);
