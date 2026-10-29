import React, { useState } from 'react';
import { View, Text, ScrollView, FlatList, Pressable, Animated } from 'react-native';
export const A = ({ items }) => <ScrollView>{items.map((i) => <Text key={i}>{i}</Text>)}</ScrollView>; // FIRES
export const B = (props) => <ScrollView>{props.items.map((i) => <Text key={i}>{i}</Text>)}</ScrollView>; // FIRES
export const C = () => {
  const [products] = useState([]);
  return <ScrollView>{products.map((p) => <Text key={p}>{p}</Text>)}</ScrollView>; // FIRES
};
export const D = () => <ScrollView><ScrollView>{load().map((p) => <Text key={p}>{p}</Text>)}</ScrollView></ScrollView>; // FIRES
export const E = ({ items }) => <ScrollView>{items.slice(0, 20).map((p) => <Text key={p}>{p}</Text>)}</ScrollView>; // FIRES
const SPREAD = [...props.all];
export const F = () => <ScrollView>{SPREAD.map((p) => <Text key={p}>{p}</Text>)}</ScrollView>; // FIRES
export const G = (props) => <ScrollView>{[...props.all].map((p) => <Text key={p}>{p}</Text>)}</ScrollView>; // FIRES
const GROWN = ['a'];
GROWN.push(...extra);
export const H = () => <ScrollView>{GROWN.map((p) => <Text key={p}>{p}</Text>)}</ScrollView>; // FIRES
const EMPTY = [];
const TYPED: Item[] = [] as Item[];
export const I = () => <ScrollView>{EMPTY.map((p) => <Text key={p}>{p}</Text>)}</ScrollView>; // FIRES
export const J = () => <ScrollView>{TYPED.map((p) => <Text key={p}>{p}</Text>)}</ScrollView>; // FIRES
const REASSIGNED = ['a'];
REASSIGNED = load();
export const K = () => <ScrollView>{REASSIGNED.map((p) => <Text key={p}>{p}</Text>)}</ScrollView>; // FIRES
