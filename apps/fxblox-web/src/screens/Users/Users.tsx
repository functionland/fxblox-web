/**
 * Port of apps/box/src/screens/Users/Users.screen.tsx (+ UserHeader). Mock data as mobile (decision: Users stays
 * mock). The reanimated fade-in condensed header is a sticky bar toggled by an IntersectionObserver on a sentinel
 * above the avatar; tapping it scrolls back to the top. Embeds WalletDetails (DID, App PeerId, Bloxs' peer ids).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxAvatar, FxBox, FxPressableOpacity, FxText, cn } from '@functionland/fx-ui';
import { MainScreen } from '@/components/main/MainScreen';
import { WalletGate } from '@/components/main/WalletGate';
import { WalletDetails } from '@/components/WalletDetails';
import sampleAvatar from './img/sample.png';

export type TUser = {
  connectionDate: string | number; // UTC
  decentralizedId: string;
  imageUrl?: string;
  username: string;
  peerId: string[]; // identifiers for separate hardware setups
  securityPassphrase: string;
  walletId: string;
  walletName: string;
};

export type TFriend = {
  status: 'invited' | 'accepted';
  connectionDate: string | number;
  decentralizedId: string;
  imageUrl?: string;
  username: string;
  peerId: string[];
};

export const mockUserData: TUser = {
  connectionDate: new Date().valueOf(),
  decentralizedId: 'key:abc12345xyz',
  username: 'testUser',
  peerId: ['1'],
  imageUrl: sampleAvatar,
  securityPassphrase: 'bluebird',
  walletId: 'wallet12345',
  walletName: 'TrustWallet',
};

export const mockFriendData: TFriend[] = [
  { status: 'accepted', connectionDate: new Date().valueOf(), decentralizedId: 'ghoim234tnas09', username: 'friend1', peerId: ['1'], imageUrl: sampleAvatar },
  { status: 'invited', connectionDate: new Date().valueOf(), decentralizedId: '1plk09aslkm', username: 'friend2', peerId: ['1'], imageUrl: sampleAvatar },
  { status: 'accepted', connectionDate: new Date().valueOf(), decentralizedId: 'lkj013980ma', username: 'friend3', peerId: ['1'], imageUrl: sampleAvatar },
];

function UserHeader({ userData }: { userData: TUser }) {
  return (
    <FxBox alignItems="center" testID="user-header">
      <FxAvatar source={userData.imageUrl ?? sampleAvatar} size="xl" alt={userData.username} />
      <FxBox paddingVertical="20" className="w-full">
        <WalletGate>
          <WalletDetails showDID={true} showNetwork={false} showPeerId={true} showBloxPeerIds={true} />
        </WalletGate>
      </FxBox>
    </FxBox>
  );
}

function PrimaryUserCondensed({ userData, onPress }: { userData: TUser; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <FxPressableOpacity
      onPress={onPress}
      aria-label={t('main.users.scrollToTop')}
      flexDirection="row"
      alignItems="center"
      gap="16"
      minHeight={40}
      className="fx-hover-opacity"
      testID="users-condensed-user"
    >
      <FxAvatar source={userData.imageUrl ?? sampleAvatar} size="medium" alt="" />
      <FxText variant="bodySmallRegular" color="content1">
        @{userData.username}
      </FxText>
    </FxPressableOpacity>
  );
}

export default function Users() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setCondensed(!entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToTop = () => {
    const behavior: ScrollBehavior = 'smooth';
    sentinelRef.current?.scrollIntoView({ behavior, block: 'start' });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior });
  };

  return (
    <MainScreen screen="users" width="reading" className="relative pt-0" testID="users-screen">
      <div ref={sentinelRef} data-testid="users-sentinel" aria-hidden="true" className="h-4 w-full" />
      <div
        data-testid="users-condensed-header"
        data-condensed={condensed}
        aria-hidden={!condensed}
        className={cn(
          'sticky top-0 z-10 -mx-5 bg-background-app px-5 py-2 transition-opacity desktop:top-16',
          condensed ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <PrimaryUserCondensed userData={mockUserData} onPress={scrollToTop} />
      </div>
      <UserHeader userData={mockUserData} />
    </MainScreen>
  );
}
