import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardSafeAreaView } from './src/components/KeyboardViewport';
import { OfflineBanner } from './src/components/OfflineBanner';
import { ToastProvider } from './src/components/Toast';
import { useSession } from './src/features/auth/useSession';
import { usePreference } from './src/features/settings/usePreference';
import { SignInScreen } from './src/screens/SignInScreen';
import { configError } from './src/services/firebase/firebase';
import { darkColors, lightColors, ThemeContext } from './src/theme/theme';
import { MemberWorkspace } from './src/workspace/MemberWorkspace';

const themeModes = ['system', 'light', 'dark'] as const;

export default function App() {
  const { session, showLoginReminder, dismissLoginReminder } = useSession();
  const system = useColorScheme();
  const theme = usePreference('marchix:theme', themeModes, 'system');
  const dark = theme.value === 'dark' || (theme.value === 'system' && system === 'dark');
  const colors = dark ? darkColors : lightColors;

  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={{ colors, dark, mode: theme.value, ready: theme.ready, setMode: theme.save }}>
        <ToastProvider>
          <KeyboardSafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <StatusBar style={dark ? 'light' : 'dark'} />
            <OfflineBanner />
            {!configError && session.kind === 'member'
              ? <MemberWorkspace key={session.email} email={session.email} name={session.name}
                  photoURL={session.photoURL} isAdmin={session.isAdmin} hasReviewGrant={session.hasReviewGrant}
                  accountCreatedAt={session.accountCreatedAt}
                  canReadCash={session.canReadCash} canReviewCash={session.canReviewCash} canReviewRequests={session.canReviewRequests}
                  canManageProjects={session.canManageProjects} canReadTeamPlans={session.canReadTeamPlans}
                  canReadTeamKpi={session.canReadTeamKpi} canManageRecords={session.canManageRecords}
                  showLoginReminder={showLoginReminder} onDismissLoginReminder={dismissLoginReminder} />
              : <SignInScreen sessionKind={session.kind} />}
          </KeyboardSafeAreaView>
        </ToastProvider>
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}
