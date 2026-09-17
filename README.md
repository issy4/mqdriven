# MQ ERP — 自宅PC・AIエージェント向け入口

> **最新作業（2026-09-04）**: Gemini API安全化とAIゲートウェイ再設計。
>
> 自宅PC、Claude、Codexのいずれも、作業開始前に
> [`docs/HANDOFF_2026-09-04_AI_GATEWAY.md`](docs/HANDOFF_2026-09-04_AI_GATEWAY.md) を読むこと。
> 恒久設計は [`docs/architecture/AI_GATEWAY_REDESIGN.md`](docs/architecture/AI_GATEWAY_REDESIGN.md)。
>
> 現在はPreview検証と本番切替前。本番配備、DB変更、旧キー無効化を推測で実行しない。

## 自宅PCでの再開

```powershell
git clone https://github.com/shoichi-spec/mqdriven.git
cd mqdriven
Get-Content -Raw docs\HANDOFF_2026-09-04_AI_GATEWAY.md
```

既にclone済みの場合:

```powershell
git pull --ff-only
Get-Content -Raw docs\HANDOFF_2026-09-04_AI_GATEWAY.md
```

## Claudeでの再開

リポジトリを開き、次のように依頼する。

```text
CLAUDE.mdとdocs/HANDOFF_2026-09-04_AI_GATEWAY.mdを読み、
記載された安全条件を守って未完了箇所から再開してください。
```

---

# 旧README: AI Studio Gemini App Proxy Server

This nodejs proxy server lets you run your AI Studio Gemini application unmodified, without exposing your API key in the frontend code.


## Instructions

**Prerequisites**:
- [Google Cloud SDK / gcloud CLI](https://cloud.google.com/sdk/docs/install)
- (Optional) Gemini API Key

1. Download or copy the files of your AI Studio app into this directory at the root level.
2. If your app calls the Gemini API, create a Secret for your API key:
     ```
     echo -n "${GEMINI_API_KEY}" | gcloud secrets create gemini_api_key --data-file=-
     ```

3.  Deploy to Cloud Run (optionally including API key):
    ```
    gcloud run deploy my-app --source=. --update-secrets=GEMINI_API_KEY=gemini_api_key:latest
    ```

## Supabase Auth Configuration

To keep Supabase authentication aligned with the production domain, set the following values in **Project Settings → Authentication → URL Configuration**:

1. **Site URL**: `https://erp.b-p.co.jp`
2. **Redirect URLs**: Add each line below exactly as written (wildcards are allowed by Supabase):
   - `https://*.b-p.co.jp`
   - `https://erp.b-p.co.jp/auth/callback`
   - `https://erp.b-p.co.jp`

Save the changes after updating the Site URL and redirect allow list. These values ensure the email templates and Google OAuth callbacks used by the app match the production ERP hostname.

Deployment trigger test.
