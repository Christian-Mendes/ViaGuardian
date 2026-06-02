import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api',
  timeout: 12000,
  headers: {
    'Content-Type': 'application/json',
  },
})
