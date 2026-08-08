import * as fs from 'fs';
import * as path from 'path';
import { render } from '@react-email/render';
import * as React from 'react';

import { SupabaseConfirmSignup } from '../emails/SupabaseConfirmSignup';
import { SupabaseMagicLink } from '../emails/SupabaseMagicLink';
import { SupabaseResetPassword } from '../emails/SupabaseResetPassword';
import { SupabaseChangeEmail } from '../emails/SupabaseChangeEmail';
import { BullValueWelcomeEmail } from '../emails/BullValueWelcome';
import { BullValueUpgradeEmail } from '../emails/BullValueUpgrade';

const outDir = path.join(process.cwd(), 'out-emails');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function build() {
  const templates = [
    { name: 'SupabaseConfirmSignup.html', component: <SupabaseConfirmSignup /> },
    { name: 'SupabaseMagicLink.html', component: <SupabaseMagicLink /> },
    { name: 'SupabaseResetPassword.html', component: <SupabaseResetPassword /> },
    { name: 'SupabaseChangeEmail.html', component: <SupabaseChangeEmail /> },
    { name: 'BullValueWelcome.html', component: <BullValueWelcomeEmail /> },
    { name: 'BullValueUpgrade.html', component: <BullValueUpgradeEmail /> },
  ];

  for (const { name, component } of templates) {
    // The render function converts the React component to an HTML string
    const html = await render(component, {
      pretty: true,
    });
    fs.writeFileSync(path.join(outDir, name), html);
    console.log(`✅ Generated ${name}`);
  }
}

build().catch(console.error);
