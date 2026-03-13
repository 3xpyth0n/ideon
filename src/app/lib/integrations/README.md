# Adding a New Integration

To add a new integration to Ideon, follow these steps:

## 1. Create Integration Manifest

Create a new folder under `src/app/lib/integrations/` with your integration name:

```
src/app/lib/integrations/
  └── your-integration/
      └── manifest.ts
```

Example `manifest.ts`:

```typescript
import { IntegrationManifest } from "../types";

export const yourIntegrationManifest: IntegrationManifest = {
  id: "your-integration",
  name: "Your Integration",
  description: "Short description for internal use",
  iconUrl: "https://example.com/icon.png",
  category: "notes", // or "communication" | "automation" | "design" | "productivity"
  releaseStatus: "coming_soon", // "coming_soon" | "beta" | "released"
  nameKey: "importFromYourIntegration",
  descriptionKey: "importFromYourIntegrationDesc",
};
```

## 2. Register the Integration

Add your manifest to `src/app/lib/integrations/index.ts`:

```typescript
import { yourIntegrationManifest } from "./your-integration/manifest";

registerIntegration(yourIntegrationManifest);
```

## 3. Add i18n Translations

Add translation keys in **all language files** located in `src/app/i18n/`.

Example for **`src/app/i18n/en.json`** (add to `integrations` object):

```json
"importFromYourIntegration": "Import from Your Integration",
"importFromYourIntegrationDesc": "Sync your data into Ideon projects"
```

**Important**: Repeat this for all language files in the `src/app/i18n/` directory.

## That's it!

The integration will automatically appear in the `/integrations` page.

## Files Modified Summary

- **1 new file**: `src/app/lib/integrations/your-integration/manifest.ts`
- **1 line added**: In `src/app/lib/integrations/index.ts`
- **i18n files**: Add keys in all files in `src/app/i18n/`

Total: **Few files touched** (mostly additions, no complex logic)
