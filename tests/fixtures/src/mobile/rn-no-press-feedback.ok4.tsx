import React from 'react';
import { Pressable } from 'react-native';
export const A = () => <Pressable accessibilityLabel="Close menu scrim" onPress={close} style={s.fill} />;
export const B = () => <Pressable testID="sheet-Backdrop" onPress={close} style={s.fill} />;
export const C = () => <Pressable testID={'modal-overlay'} onPress={close} style={s.fill} />;
