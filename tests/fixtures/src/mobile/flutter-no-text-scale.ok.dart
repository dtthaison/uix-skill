import 'package:flutter/material.dart';

Widget clamped(BuildContext context, Widget child) {
  final s = MediaQuery.textScalerOf(context).clamp(maxScaleFactor: 1.4);
  return MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: s),
    child: child,
  );
}
