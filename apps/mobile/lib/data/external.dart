import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

/// Everything that leaves the app (browser, share sheet). One seam so screens stay testable
/// without platform channels — tests override [externalActionsProvider] with a recorder.
abstract class ExternalActions {
  /// Opens [url] in the browser / the airline's app. Returns false when nothing could handle it.
  Future<bool> openUrl(Uri url);

  /// Shares plain [text]; with [fileText] also attaches a text file (e.g. a .ics calendar entry).
  Future<void> share({required String text, String? subject, String? fileName, String? fileText, String fileMime});
}

class PlatformExternalActions implements ExternalActions {
  const PlatformExternalActions();

  @override
  Future<bool> openUrl(Uri url) async {
    try {
      return await launchUrl(url, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> share({required String text, String? subject, String? fileName, String? fileText, String fileMime = 'text/plain'}) async {
    final withFile = fileName != null && fileText != null;
    await SharePlus.instance.share(
      ShareParams(
        text: withFile ? null : text,
        subject: subject,
        title: subject,
        files: withFile ? [XFile.fromData(Uint8List.fromList(utf8.encode(fileText)), mimeType: fileMime, name: fileName)] : null,
        fileNameOverrides: withFile ? [fileName] : null,
      ),
    );
  }
}

final externalActionsProvider = Provider<ExternalActions>((ref) => const PlatformExternalActions());
