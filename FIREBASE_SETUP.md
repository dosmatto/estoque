# Configurar Firebase Firestore

Este app usa GitHub Pages para hospedar a tela e Firebase Firestore para salvar os dados em nuvem.

## 1. Criar o projeto

1. Acesse `https://console.firebase.google.com/`
2. Clique em `Adicionar projeto`
3. Nome sugerido: `estoque-fazendas`
4. Pode desativar o Google Analytics para este teste
5. Conclua a criacao

## 2. Criar o app web

1. Dentro do projeto, clique no icone `Web` (`</>`)
2. Nome do app: `estoque-web`
3. Nao precisa marcar Firebase Hosting, porque ja estamos usando GitHub Pages
4. Copie o objeto `firebaseConfig`

## 3. Colar a configuracao

Abra o arquivo `firebase-config.js`.

Troque:

```js
export const USE_FIREBASE = false;
```

por:

```js
export const USE_FIREBASE = true;
```

Depois cole os dados do Firebase dentro de `firebaseConfig`.

## 4. Criar o Firestore

1. No menu lateral do Firebase, clique em `Firestore Database`
2. Clique em `Criar banco de dados`
3. Escolha `Modo de producao`
4. Escolha a regiao mais proxima disponivel
5. Conclua

## 5. Regras temporarias para teste

No Firestore, abra a aba `Regras` e use isto para a fase de teste:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /appState/main {
      allow read, write: if true;
    }
  }
}
```

Clique em `Publicar`.

Importante: estas regras deixam somente o documento principal do app publico para leitura/escrita. E simples para teste sem login, mas nao e a seguranca final ideal.

## 6. Subir para o GitHub

Envie estes arquivos atualizados para o repositorio:

- `index.html`
- `app.js`
- `styles.css`
- `firebase-config.js`
- `FIREBASE_SETUP.md`

Depois clique em `Commit changes`.

## 7. Testar

Abra em dois celulares ou dois navegadores:

Admin:

`https://dosmatto.github.io/estoque/?admin=ADMIN-TESTE-2026`

Fazenda Modelo:

`https://dosmatto.github.io/estoque/?fazenda=ABC123XYZ`

Ao alterar em um aparelho, o outro deve atualizar sozinho em poucos segundos.
