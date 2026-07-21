using System.Security.Cryptography;
using System.Text;

namespace OrchidLLM.Web.Services.Security;

public interface IProviderKeyCipher
{
    /// <summary>Encrypts a raw upstream provider API key for storage in ProviderKey.KeyCipher.</summary>
    string Encrypt(string plaintext);

    /// <summary>Decrypts a ProviderKey.KeyCipher value back to the raw key, for dispatch time only.</summary>
    string Decrypt(string cipherText);

    /// <summary>Masked display value for admin UI — never the full key (e.g. "sk-or-v1-a3f8...k2x1").</summary>
    string Mask(string plaintext);
}

/// <summary>
/// AES-256-GCM at-rest encryption for provider API keys, keyed by Orchid:EncryptionKey
/// (base64, 32 bytes). Replaces the plan's .env-only key storage — keys now live in the
/// ProviderKey table, configured via the admin Channels UI, encrypted at rest.
/// </summary>
public class ProviderKeyCipher : IProviderKeyCipher
{
    private const int NonceSize = 12;
    private const int TagSize = 16;

    private readonly byte[] _key;

    public ProviderKeyCipher(IConfiguration config)
    {
        var configured = config["Orchid:EncryptionKey"];
        if (string.IsNullOrWhiteSpace(configured))
        {
            throw new InvalidOperationException(
                "Orchid:EncryptionKey is not configured. Generate one with a base64-encoded 32-byte value " +
                "(e.g. `openssl rand -base64 32`) and set it in appsettings/user-secrets before storing provider keys.");
        }

        _key = Convert.FromBase64String(configured);
        if (_key.Length != 32)
        {
            throw new InvalidOperationException("Orchid:EncryptionKey must decode to exactly 32 bytes (AES-256).");
        }
    }

    public string Encrypt(string plaintext)
    {
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var plainBytes = Encoding.UTF8.GetBytes(plaintext);
        var cipherBytes = new byte[plainBytes.Length];
        var tag = new byte[TagSize];

        using var aes = new AesGcm(_key, TagSize);
        aes.Encrypt(nonce, plainBytes, cipherBytes, tag);

        // Layout: nonce || tag || ciphertext, base64-encoded as a single blob.
        var combined = new byte[NonceSize + TagSize + cipherBytes.Length];
        Buffer.BlockCopy(nonce, 0, combined, 0, NonceSize);
        Buffer.BlockCopy(tag, 0, combined, NonceSize, TagSize);
        Buffer.BlockCopy(cipherBytes, 0, combined, NonceSize + TagSize, cipherBytes.Length);
        return Convert.ToBase64String(combined);
    }

    public string Decrypt(string cipherText)
    {
        var combined = Convert.FromBase64String(cipherText);
        var nonce = combined[..NonceSize];
        var tag = combined[NonceSize..(NonceSize + TagSize)];
        var cipherBytes = combined[(NonceSize + TagSize)..];
        var plainBytes = new byte[cipherBytes.Length];

        using var aes = new AesGcm(_key, TagSize);
        aes.Decrypt(nonce, cipherBytes, tag, plainBytes);
        return Encoding.UTF8.GetString(plainBytes);
    }

    public string Mask(string plaintext)
    {
        if (plaintext.Length <= 12)
        {
            return new string('*', plaintext.Length);
        }

        return string.Concat(plaintext.AsSpan(0, 8), "...", plaintext.AsSpan(plaintext.Length - 4));
    }
}
