import React, { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { UserDoc, Collaborator, FormField, RecordDoc, DraftDoc } from './types';
import { ensureSeedData, DEFAULT_HSE_FIELDS, PERMANENT_ADMIN_EMAIL } from './lib/seed';
import { Header } from './components/Header';
import { AuthModal } from './components/AuthModal';
import { WizardForm } from './components/WizardForm';
import { DraftsModal } from './components/DraftsModal';
import { AdminPanel } from './components/AdminPanel';
import { AlertTriangle, WifiOff, Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserDoc | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Sync state
  const [syncState, setSyncState] = useState<'synchronized' | 'connecting' | 'offline'>('synchronized');

  // Application Data
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [fields, setFields] = useState<FormField[]>([]);
  const [records, setRecords] = useState<RecordDoc[]>([]);
  const [drafts, setDrafts] = useState<DraftDoc[]>([]);

  // Modals UI
  const [isDraftsOpen, setIsDraftsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [activeDraft, setActiveDraft] = useState<DraftDoc | null>(null);

  // Online/Offline network listeners
  useEffect(() => {
    const handleOnline = () => setSyncState('synchronized');
    const handleOffline = () => setSyncState('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) setSyncState('offline');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Realtime Auth State & Single Source of Truth Profile Listener
  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (!firebaseUser) {
        setCurrentUser(null);
        setAuthLoading(false);
        return;
      }

      // Realtime listener on user profile doc for immediate revocation check
      const userRef = doc(db, 'users', firebaseUser.uid);
      unsubUserDoc = onSnapshot(userRef, (docSnap) => {
        if (!docSnap.exists()) {
          // Profile deleted -> force logout
          signOut(auth);
          setCurrentUser(null);
          setAuthLoading(false);
          return;
        }

        const userData = { id: docSnap.id, ...docSnap.data() } as UserDoc;
        
        if (userData.status !== 'approved') {
          // Status revoked or pending -> force logout
          signOut(auth);
          setCurrentUser(null);
        } else {
          setCurrentUser(userData);
        }
        setAuthLoading(false);
      }, (err) => {
        console.error('User doc listener error:', err);
        setAuthLoading(false);
      });
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  // Listen to application collections once user is authenticated
  useEffect(() => {
    if (!currentUser) return;

    if (currentUser.status === 'approved') {
      ensureSeedData();
    }

    // 1. Collaborators listener
    const qCollab = query(collection(db, 'collaborators'));
    const unsubCollab = onSnapshot(qCollab, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Collaborator));
      setCollaborators(docs);
    }, (err) => console.warn('Collaborators listener error:', err));

    // 2. Form Fields listener
    const qFields = query(collection(db, 'formFields'));
    const unsubFields = onSnapshot(qFields, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as FormField));
      setFields(docs.sort((a,b) => a.order - b.order));
    }, (err) => console.warn('FormFields listener error:', err));

    // 3. Records listener
    const qRecords = query(collection(db, 'records'));
    const unsubRecords = onSnapshot(qRecords, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as RecordDoc));
      setRecords(docs);
    }, (err) => console.warn('Records listener error:', err));

    // 4. Drafts listener (for current user)
    const qDrafts = query(collection(db, 'drafts'), where('ownerUid', '==', currentUser.id));
    const unsubDrafts = onSnapshot(qDrafts, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as DraftDoc));
      setDrafts(docs);
    }, (err) => console.warn('Drafts listener error:', err));

    return () => {
      unsubCollab();
      unsubFields();
      unsubRecords();
      unsubDrafts();
    };
  }, [currentUser]);

  // Compute Metrics for Header
  const totalRecords = records.length;
  const conformesCount = records.filter(r => r.status === 'Conforme').length;
  const alertasCriticosCount = records.filter(r => r.status === 'Alerta' || r.status === 'Crítico').length;
  const scoreHse = totalRecords > 0 ? Math.round((conformesCount / totalRecords) * 100) : 100;

  // Logout handler
  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setIsAdminOpen(false);
    setIsDraftsOpen(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-[#3F3F3F] animate-spin mb-3" />
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">
          Carregando ProntoSens AI...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 flex flex-col">
      
      {/* Header */}
      <Header
        user={currentUser}
        onLogout={handleLogout}
        syncState={syncState}
        draftsCount={drafts.length}
        onOpenDrafts={() => setIsDraftsOpen(true)}
        metrics={{
          total: totalRecords,
          conformes: conformesCount,
          alertasCriticos: alertasCriticosCount,
          scoreHse: scoreHse,
        }}
        onOpenAdminPanel={() => setIsAdminOpen(true)}
        isAdminOpen={isAdminOpen}
      />

      {/* Main Content Body */}
      <main className="flex-1 pt-20 sm:pt-24 pb-12">
        {!currentUser ? (
          <AuthModal />
        ) : (
          <WizardForm
            fields={fields.length > 0 ? fields : DEFAULT_HSE_FIELDS}
            collaborators={collaborators}
            currentUserEmail={currentUser.email}
            currentUserUid={currentUser.id}
            activeDraft={activeDraft}
            onClearDraftContext={() => setActiveDraft(null)}
            onRecordSubmitted={() => {
              setActiveDraft(null);
              setIsDraftsOpen(false);
            }}
            onOpenDraftsModal={() => setIsDraftsOpen(true)}
          />
        )}
      </main>

      {/* Drafts Modal */}
      <DraftsModal
        isOpen={isDraftsOpen}
        onClose={() => setIsDraftsOpen(false)}
        drafts={drafts}
        onResumeDraft={(draft) => {
          setActiveDraft(draft);
          setIsDraftsOpen(false);
        }}
        onDeleteDraft={async (draftId) => {
          try {
            await import('firebase/firestore').then(({ doc, deleteDoc }) => 
              deleteDoc(doc(db, 'drafts', draftId))
            );
          } catch (err) {
            console.error('Error deleting draft:', err);
          }
        }}
      />

      {/* Admin Panel */}
      {isAdminOpen && currentUser && (
        <AdminPanel
          currentUser={currentUser}
          onClose={() => setIsAdminOpen(false)}
        />
      )}

      {/* Offline Banner fallback */}
      {syncState === 'offline' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-red-600 text-white text-center py-2 px-4 text-xs font-bold flex items-center justify-center gap-2 shadow-lg">
          <WifiOff className="w-4 h-4" />
          <span>Sem conexão com a internet. Suas alterações serão sincronizadas assim que a rede voltar.</span>
        </div>
      )}

    </div>
  );
}
