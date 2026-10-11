import { useRpc } from "@getpaseo/plugin/client";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { sonDegerlendirme } from "../shared/contracts";

export function DegerlendirmeEkrani({ theme, layout, params }: PluginScreenProps) {
  const cagir = useRpc(sonDegerlendirme);
  const cwd = params.cwd ?? "";
  const { data, isLoading, error } = useQuery({
    queryKey: ["son-degerlendirme", cwd],
    queryFn: () => cagir({ cwd }),
    enabled: cwd.length > 0,
  });
  const styles = useMemo(
    () => ({
      screen: { flex: 1, padding: layout.compact ? 16 : 24, gap: 12, backgroundColor: theme.colors.surface0 },
      baslik: { color: theme.colors.foreground, fontSize: layout.compact ? 18 : 22 },
      satir: { color: theme.colors.foregroundMuted, fontSize: 14 },
      deger: { color: theme.colors.foreground, fontSize: 14 },
      govde: { color: theme.colors.foreground, fontSize: 13, fontFamily: "monospace" as const },
    }),
    [theme, layout.compact],
  );
  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.baslik}>Öz-değerlendirme</Text>
      <Text style={styles.satir}>{cwd}</Text>
      {isLoading && <Text style={styles.satir}>Yükleniyor…</Text>}
      {error && <Text style={styles.satir}>Hata: {String(error)}</Text>}
      {data && (
        <View style={{ gap: 8 }}>
          <Text style={styles.deger}>
            Kilitli sürümler: {data.kilitler.length > 0 ? data.kilitler.join(" · ") : "yok"}
          </Text>
          <Text style={styles.satir}>
            {data.dosya ? "Rapor: " + data.dosya : "Henüz rapor yok — ilk değerlendirme haftalık heartbeat ile üretilir (REHBER §10)."}
          </Text>
          {data.icerik && <Text style={styles.govde}>{data.icerik}</Text>}
        </View>
      )}
    </ScrollView>
  );
}
