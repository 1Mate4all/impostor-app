import { generateSecretKey, getPublicKey, finalizeEvent, nip19 } from 'nostr-tools'

export function generateKeyPair() {
  const secretKey = generateSecretKey()
  const publicKey = getPublicKey(secretKey)
  
  return {
    privateKey: Buffer.from(secretKey).toString('hex'),
    publicKey,
    npub: nip19.npubEncode(publicKey),
    nsec: nip19.nsecEncode(secretKey)
  }
}

export function getPublicKeyFromPrivate(privateKeyHex: string) {
  try {
    const secretKey = Buffer.from(privateKeyHex, 'hex')
    return getPublicKey(secretKey)
  } catch (e) {
    console.error('Error getting public key:', e)
    return ''
  }
}

export function encodePubkey(publicKey: string) {
  try {
    if (!publicKey || publicKey.length !== 64) {
      return publicKey || ''
    }
    return nip19.npubEncode(publicKey)
  } catch (e) {
    console.error('Error encoding pubkey:', e)
    return publicKey || ''
  }
}

export function decodeNpub(npub: string) {
  try {
    if (!npub) return null
    const decoded = nip19.decode(npub)
    if (decoded.type === 'npub') {
      return decoded.data
    }
  } catch (e) {
    console.error('Invalid npub:', e)
  }
  return null
}

export function decodeNsec(nsec: string) {
  try {
    if (!nsec) return null
    const decoded = nip19.decode(nsec)
    if (decoded.type === 'nsec') {
      return Buffer.from(decoded.data).toString('hex')
    }
  } catch (e) {
    console.error('Invalid nsec:', e)
  }
  return null
}
