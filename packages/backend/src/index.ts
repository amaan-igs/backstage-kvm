import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({
  path: path.resolve(__dirname, '../../../.env'),
});

import { createBackend } from '@backstage/backend-defaults';
import { createBackendModule } from '@backstage/backend-plugin-api';
import { githubAuthenticator } from '@backstage/plugin-auth-backend-module-github-provider';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';
import { stringifyEntityRef, DEFAULT_NAMESPACE } from '@backstage/catalog-model';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(import('@backstage/plugin-techdocs-backend'));

// auth related stuff 
const customAuthResolver = createBackendModule({
  // This ID must be exactly "auth" because that's the plugin it targets
  pluginId: 'auth',
  // This ID must be unique, but can be anything
  moduleId: 'custom-auth-provider',
  register(reg) {
    reg.registerInit({
      deps: { providers: authProvidersExtensionPoint },
      async init({ providers }) {
        providers.registerProvider({
          // This ID must match the actual provider config, e.g. addressing
          // auth.providers.github means that this must be "github".
          providerId: 'github',
          // Use createProxyAuthProviderFactory instead if it's one of the proxy
          // based providers rather than an OAuth based one
          factory: createOAuthProviderFactory({
            authenticator: githubAuthenticator,
            additionalScopes: ['read:user', 'user:email'],
            async signInResolver({ profile }, ctx) {
              console.log('Auth profile received:', JSON.stringify(profile, null, 2));
              
              if (!profile.email) {
                throw new Error(
                  'Login failed, user profile does not contain an email',
                );
              }
              
              // GitHub might return primary email in profile.email
              let hasSudoConsultantsEmail = false;
              
              // Check primary email
              if (profile.email.endsWith('sudoconsultants.com')) {
                hasSudoConsultantsEmail = true;
              }
              
              // For testing/development purposes - allow specific emails
              if (!hasSudoConsultantsEmail) {
                console.log(`Login attempt with email: ${profile.email}`);
                
                // Comment out this condition in production
                if (profile.email === 'amaanulhaq.s@outlook.com') {
                  hasSudoConsultantsEmail = true;
                  console.log('Allowing login with outlook email for testing');
                } else {
                  throw new Error(
                    `Login failed, '${profile.email}' is not from the 'sudoconsultants.com' domain`,
                  );
                }
              }
              
              // Use primary email for the user entity
              const emailParts = profile.email.split('@');
              const localPart = emailParts[0];
              
              // By using `stringifyEntityRef` we ensure that the reference is formatted correctly
              const userEntity = stringifyEntityRef({
                kind: 'User',
                name: localPart,
                namespace: DEFAULT_NAMESPACE,
              });
              
              return ctx.issueToken({
                claims: {
                  sub: userEntity,
                  ent: [userEntity],
                },
              });
            }
          }),
        });
      },
    });
  },
});

backend.add(import('@backstage/plugin-auth-backend'));
backend.add(customAuthResolver);

// See https://backstage.io/docs/backend-system/building-backends/migrating#the-auth-plugin
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
// See https://backstage.io/docs/auth/guest/provider

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// See https://backstage.io/docs/features/software-catalog/configuration#subscribing-to-catalog-errors
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));

// permission plugin
backend.add(import('@backstage/plugin-permission-backend'));
// See https://backstage.io/docs/permissions/getting-started for how to create your own permission policy
backend.add(
  import('@backstage/plugin-permission-backend-module-allow-all-policy'),
);

// search plugin
backend.add(import('@backstage/plugin-search-backend'));

// search engine
// See https://backstage.io/docs/features/search/search-engines
backend.add(import('@backstage/plugin-search-backend-module-pg'));

// search collators
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

// kubernetes
backend.add(import('@backstage/plugin-kubernetes-backend'));

backend.start();
