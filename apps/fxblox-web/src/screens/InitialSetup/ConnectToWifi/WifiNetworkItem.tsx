/** Port of ConnectToWifi/components/WifiDeviceItem.tsx — one selectable SSID row. */
import { FxInvertedCheckIcon, FxPressableOpacity, FxText } from '@functionland/fx-ui';

export interface WifiNetworkItemProps {
  ssid: string;
  connected: boolean;
  onSelect: (ssid: string) => void;
}

export function WifiNetworkItem({ ssid, connected, onSelect }: WifiNetworkItemProps) {
  return (
    <FxPressableOpacity
      as="li"
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      paddingHorizontal="8"
      onPress={() => onSelect(ssid)}
      aria-pressed={connected}
      className="w-full rounded-fx-s text-left hover:bg-background-secondary"
      data-ssid={ssid}
    >
      <FxText variant="bodyMediumRegular" paddingVertical="12" className="break-all">
        {ssid}
      </FxText>
      {connected && <FxInvertedCheckIcon width={20} height={20} color="primary" />}
    </FxPressableOpacity>
  );
}

export default WifiNetworkItem;
