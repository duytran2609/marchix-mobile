import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ToastProvider } from './src/components/Toast';
import { useSession } from './src/features/auth/useSession';
import { SignInScreen } from './src/screens/SignInScreen';
import { configError } from './src/services/firebase/firebase';
import { colors } from './src/theme/theme';
import { MemberWorkspace } from './src/workspace/MemberWorkspace';

export default function App() {
  const session = useSession();

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <SafeAreaView style={styles.safe}>
          <StatusBar style="dark" />
          {!configError && session.kind === 'member'
            ? <MemberWorkspace key={session.email} email={session.email} name={session.name}
                photoURL={session.photoURL} isAdmin={session.isAdmin} hasReviewGrant={session.hasReviewGrant} />
            : <SignInScreen sessionKind={session.kind} />}
        </SafeAreaView>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
});
