import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api';
import {
  Credentials,
  Registration,
  Authentication,
  User,
} from '@/types';

export interface UserState {
  currentUser: User | null
  token: string | null
}

export type RegistrationResult = Authentication | { verificationRequired: true; email: string }

export const useUserStore = defineStore("user", () => {
  const currentUser = ref<User | null>(null)
  const token = ref<string | null>(null)
  const isAdmin = ref(false)
  let storageRestorePromise: Promise<void> | null = null

  async function authenticate(credentials: Credentials) {
    const authentication = await api.post<Authentication>('authenticate', credentials)
    token.value = authentication.data.token
    setCurrentUser()
  }

  async function register(registration: Registration) {
    const response = await api.post<RegistrationResult>('register', registration)
    if ('token' in response.data) {
      token.value = response.data.token
      await setCurrentUser()
    }
    return response.data
  }

  async function verifyRegistration(email: string, code: string) {
    const authentication = await api.post<Authentication>('register/verify', { email, code })
    token.value = authentication.data.token
    await setCurrentUser()
  }

  function logout() {
    localStorage.removeItem('arkham-token')
    delete api.defaults.headers.common.Authorization
    signOut()
  }

  async function setCurrentUser() {
    if (token.value) {
      localStorage.setItem('arkham-token', token.value);
      api.defaults.headers.common.Authorization = `Token ${token.value}`;
      try {
        const whoami = await api.get<User>('whoami')
        currentUser.value = whoami.data
        isAdmin.value = whoami.data.admin
      } catch (_err) {
        logout()
      }
    }
  }

  async function deleteAccount() {
    await api.delete('account')
    logout()
  }

  function loadUserFromStorage(): Promise<void> {
    if (currentUser.value) return Promise.resolve()
    if (storageRestorePromise) return storageRestorePromise

    const tokenFromStorage = localStorage.getItem('arkham-token');
    if (tokenFromStorage !== null && tokenFromStorage !== undefined) {
      token.value = tokenFromStorage
      storageRestorePromise = setCurrentUser().finally(() => {
        storageRestorePromise = null
      })
      return storageRestorePromise
    }
    return Promise.resolve()
  }

  function signOut() {
    currentUser.value = null
    token.value = null
  }

  return { token, currentUser, isAdmin, loadUserFromStorage, authenticate, register, verifyRegistration, logout, deleteAccount, setCurrentUser }
})
