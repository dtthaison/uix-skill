import React from 'react';
import { StyleSheet, Pressable } from 'react-native';
export const A = () => <Pressable style={StyleSheet.absoluteFill} onPress={close} />;
export const B = () => <Pressable style={[StyleSheet.absoluteFillObject, { opacity: 0.4 }]} onPress={close} />;
