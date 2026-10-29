import 'package:flutter/material.dart';

Widget fixed(BuildContext context, Widget child) {
  return MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.noScaling), // FIRES
    child: child,
  );
}
