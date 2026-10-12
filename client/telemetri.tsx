import { useRpc } from "@getpaseo/plugin/client";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { telemetriOzet } from "../shared/contracts";

export function TelemetriEkrani({ theme, layout, params }: PluginScreenProps) {
  const ozetCagir = useRpc(telemetriOzet);
  const cwd = params.cwd ?? "";
  const { data, isLoading, error } = useQuery({
    queryKey: ["telemetri-ozet", cwd],
    queryFn: () => ozetCagir({ cwd }),
    enabled: cwd.length > 0,
    refetchInterval: 10_000,
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
      <Text style={styles.baslik}>Verimlilik telemetri özeti</Text>
      <Text style={styles.satir}>{cwd}</Text>
      {isLoading && <Text style={styles.satir}>Yükleniyor…</Text>}
      {error && <Text style={styles.satir}>Hata: {String(error)}</Text>}
      {data && (
        <View style={{ gap: 6 }}>
          <Text style={styles.deger}>Tur: {data.tur}</Text>
          <Text style={styles.deger}>Loop dürtmesi: {data.loopDurtme}</Text>
          <Text style={styles.deger}>Finish-gate dürtmesi: {data.finishGateDurtme}</Text>
          <Text style={styles.deger}>Anlaşılmazlık: {data.anlasilmazlik}</Text>
          <Text style={styles.deger}>
            Kabul oranı: {data.kabulOrani === null ? "henüz veri yok" : `%${data.kabulOrani} (${data.kabul}/${data.kabul + data.ret})`}
          </Text>
          <Text style={styles.deger}>
            Token: in {data.inTok.toLocaleString("tr-TR")} / out {data.outTok.toLocaleString("tr-TR")} (cache %{data.inTok > 0 ? Math.round((data.cacheTok / data.inTok) * 1000) / 10 : 0})
          </Text>
          <Text style={styles.deger}>Ort. tur: {data.ortTurSn === null ? "henüz veri yok" : data.ortTurSn + "sn"}</Text>
          <Text style={styles.deger}>Maliyet: {data.maliyetUsd > 0 ? "~$" + data.maliyetUsd.toFixed(4) : "veri yok"}</Text>
          {Object.keys(data.modlar).length > 0 && (
            <Text style={styles.deger}>
              Modlar: {Object.entries(data.modlar).map(([m, n]) => m + " x" + n).join(" · ")}
            </Text>
          )}
          {Object.keys(data.modeller).length > 0 && (
            <Text style={styles.deger}>
              Modeller: {Object.entries(data.modeller).map(([m, n]) => m + " x" + n).join(" · ")}
            </Text>
          )}
          <Text style={styles.satir}>Kaynak: {data.dosya}</Text>
        </View>
      )}
    </ScrollView>
  );
}