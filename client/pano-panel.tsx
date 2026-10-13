import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { panoDurum } from "../shared/contracts";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

interface Durum {
  ok: boolean;
  port: number;
  uiDir: string;
  uiVar: boolean;
  paseoBagli: boolean;
  yazma: boolean;
  dinliyor: boolean;
}

export function PanoPanel({ theme, layout, navigation, workspaceId }: PluginWorkspacePanelProps) {
  const durumRpc = useRpc(panoDurum);
  const [durum, setDurum] = useState<Durum | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    let canli = true;
    durumRpc({})
      .then((r) => { if (canli) setDurum(r); })
      .catch((e) => { if (canli) setHata(e instanceof Error ? e.message : String(e)); });
    return () => { canli = false; };
  }, []);

  const url = durum ? "http://127.0.0.1:" + durum.port + "/" : null;
  const openBrowser = navigation?.openBrowser;

  const styles = useMemo(
    () => ({
      kok: { flex: 1, padding: layout.compact ? 16 : 24, backgroundColor: theme.colors.surface0, gap: 12 },
      baslik: { color: theme.colors.foreground, fontSize: 18, fontWeight: "600" as const },
      satir: { color: theme.colors.foregroundMuted, fontSize: 13 },
      dugme: { backgroundColor: theme.colors.accent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignSelf: "flex-start" as const },
      dugmeMetin: { color: theme.colors.surface0, fontWeight: "600" as const },
      uyari: { color: "#e0a34a", fontSize: 13 },
    }),
    [theme, layout.compact],
  );

  return (
    <View style={styles.kok}>
      <Text style={styles.baslik}>Pano — orkestrasyon beyni</Text>
      {hata ? <Text style={styles.uyari}>Köprü hatası: {hata}</Text> : null}
      {durum ? (
        <>
          <Text style={styles.satir}>Köprü: {durum.dinliyor ? "dinliyor" : "kapalı"} · http://127.0.0.1:{durum.port}</Text>
          <Text style={styles.satir}>Daemon: {durum.paseoBagli ? "bağlı" : "bekleniyor"} · Yazma: {durum.yazma ? "açık (token)" : "fail-closed"}</Text>
          {!durum.uiVar ? <Text style={styles.uyari}>orkestra.html bulunamadı: {durum.uiDir}</Text> : null}
          {openBrowser && url ? (
            <Pressable accessibilityRole="button" style={styles.dugme} onPress={() => openBrowser({ url, workspaceId })}>
              <Text style={styles.dugmeMetin}>Panoyu sekmede aç</Text>
            </Pressable>
          ) : (
            <Text style={styles.satir}>Bu istemcide workspace browser yok — adresi tarayıcıda aç: {url}</Text>
          )}
        </>
      ) : (
        !hata && <Text style={styles.satir}>Köprü durumu alınıyor…</Text>
      )}
    </View>
  );
}
