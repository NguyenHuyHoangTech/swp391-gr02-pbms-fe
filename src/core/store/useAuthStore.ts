import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  email: string | null;
  role: string | null;
  name: string | null;
  authProvider: 'LOCAL' | 'GOOGLE' | null;
  hasPassword: boolean;
  shiftStatus: 'OPEN' | 'CLOSED';
  activeGateId: string | null;
  setAuth: (token: string, email: string, role: string, name?: string, hasPassword?: boolean, linkedGoogle?: boolean) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  setShiftStatus: (status: 'OPEN' | 'CLOSED') => void;
  setActiveGate: (gateId: string | null) => void;
  updateProfile: (name: string) => void;
  linkGoogleAccount: () => void;
  createPassword: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      email: null,
      role: null,
      name: null,
      authProvider: null,
      hasPassword: false,
      shiftStatus: 'CLOSED',
      activeGateId: null,
      setAuth: (token, email, role, name, hasPassword, linkedGoogle) => set({
        token,
        email,
        role,
        name: name || null,
        hasPassword: hasPassword ?? false,
        authProvider: linkedGoogle ? 'GOOGLE' : 'LOCAL',
      }),
      logout: () => set({ token: null, email: null, role: null, shiftStatus: 'CLOSED', activeGateId: null, name: null, authProvider: null, hasPassword: false }),
      isAuthenticated: () => !!get().token,
      setShiftStatus: (status) => set({ shiftStatus: status }),
      setActiveGate: (gateId) => set({ activeGateId: gateId }),
      updateProfile: (name) => set({ name }),
      linkGoogleAccount: () => set({ authProvider: 'GOOGLE' }),
      createPassword: () => set({ hasPassword: true }),
    }),
    { name: 'auth-storage' }
  )
);
