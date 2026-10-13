import { useRpc } from "@getpaseo/plugin/client";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { modDurum } from "../shared/contracts";

// K-0030 (A6-2): /mod argsiz bu ekrani acar; modDurum RPC'si artik olu degil.
export function ModEkrani({ theme, layout, params }: PluginScreenProps) {
  const durumCagir = useRpc(modDurum);
  const cwd = params.cwd ?? "";
  const { data, isLoading, error } = useQuery({
    queryKey: ["mod-durum", cwd],
    queryFn: () => durumCagir({ cwd }),
    enabled: cwd.length > 0,
  });
  const styles = useMemo(
    () => ({
      screen: { flex: 1, padding: layout.compact ? 16 : 24, gap: 12, backgroundColor: theme.colors.surface0 },
      baslik: { color: theme.colors.foreground, fontSize: layout.compact ? 18 : 22 },
      satir: { color: theme.colors.foregroundMuted, fontSize: 14 },
      deger: { color: theme.colors.foreground, fontSize: 14 },
    }),
    [theme, layout.compact],
  );
  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.baslik}>Provider modu (K-0018)</Text>
      <Text style={styles.satir}>{cwd}</Text>
      {isLoading && <Text style={styles.satir}>Yükleniyor…</Text>}
      {error && <Text style={styles.satir}>Hata: {String(error)}</Text>}
      {data && (
        <View style={{ gap: 6 }}>
          <Text style={styles.deger}>Aktif mod: {data.aktif ?? "yok (eşleşme varsayılanı)"}</Text>
          <Text style={styles.deger}>Geçerli modlar: {data.modlar.join(" · ")}</Text>
          {data.eslesmeler.length > 0 ? (
            data.eslesmeler.map((e, i) => (
              <Text key={i} style={styles.satir}>
                {e.provider}/{e.modelDeseni} → {e.mod}
              </Text>
            ))
          ) : (
            <Text style={styles.satir}>Eşleşme kaydı yok — /mod &lt;mod&gt; &lt;provider/model&gt; ile ekleyin.</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}
