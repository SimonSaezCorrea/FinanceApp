/**
 * Texts of the emails (specs/032), Spanish. Same keys as `en.ts` (enforced by a parity test).
 * `{name}` placeholders are filled by the templates, always HTML-escaped. No email ever carries
 * financial data (FR-026).
 */
export const es = {
  layout: {
    footer: "Este es un correo automático de fik. No respondas a esta dirección.",
    contact: "¿Dudas? Escríbenos a {contact}.",
    buttonFallback: "Si el botón no funciona, copia este enlace en tu navegador:",
  },
  verifyEmail: {
    subject: "Confirma tu correo en fik",
    preheader: "Un clic para confirmar que esta dirección es tuya.",
    title: "Confirma tu correo",
    body: "Toca el botón para confirmar que {address} es tu correo. Así podrás recuperar tu cuenta si olvidas tu contraseña y te avisaremos de cambios importantes.",
    button: "Confirmar mi correo",
    expires: "El enlace vence en 48 horas y sirve una sola vez.",
    ignore: "Si no pediste esto, ignora este correo: no se hará ningún cambio.",
  },
  resetPassword: {
    subject: "Elige una contraseña nueva para fik",
    preheader: "Pediste recuperar el acceso a tu cuenta.",
    title: "Recupera tu cuenta",
    body: "Recibimos un pedido para recuperar el acceso a tu cuenta de fik. Toca el botón para elegir una contraseña nueva.",
    button: "Elegir contraseña nueva",
    expires: "El enlace vence en 30 minutos y sirve una sola vez.",
    sessions:
      "Al cambiarla se cerrarán todas tus sesiones abiertas. Si tienes la verificación en dos pasos, te la seguiremos pidiendo.",
    ignore: "Si no lo pediste, ignora este correo: tu contraseña no cambia.",
  },
  mfaCode: {
    preheader: "Tu código vence en 10 minutos.",
    expires: "Vence en 10 minutos y sirve una sola vez.",
    neverAsk: "Nadie de fik te pedirá este código: no lo compartas con nadie.",
    ignore: "Si no fuiste tú, ignora este correo y cambia tu contraseña.",
    purposes: {
      LOGIN: {
        subject: "Tu código para entrar a fik",
        title: "Código para entrar",
        body: "Alguien ingresó tu contraseña de fik. Para terminar de entrar, escribe este código:",
      },
      ENROLL: {
        subject: "Tu código para activar la verificación por correo en fik",
        title: "Confirma la verificación por correo",
        body: "Para que tu cuenta de fik pida un código enviado a este correo al entrar, escribe este código en tu perfil:",
      },
      STEP_UP: {
        subject: "Tu código para confirmar que eres tú en fik",
        title: "Confirma que eres tú",
        body: "Para continuar con un cambio de seguridad en tu cuenta de fik, escribe este código:",
      },
    },
  },
  securityNotice: {
    when: "Cuándo: {date} (hora de Chile).",
    notYou:
      "¿No fuiste tú? Recupera tu contraseña desde el acceso de fik ({site}) y escríbenos a {contact}.",
    kinds: {
      PASSWORD_CHANGED: {
        subject: "Cambió la contraseña de tu cuenta de fik",
        title: "Tu contraseña cambió",
        body: "La contraseña de tu cuenta de fik se cambió desde tu perfil. Las demás sesiones abiertas se cerraron.",
      },
      PASSWORD_RESET: {
        subject: "Recuperaste el acceso a tu cuenta de fik",
        title: "Elegiste una contraseña nueva",
        body: "Se eligió una contraseña nueva para tu cuenta de fik usando un enlace de recuperación. Todas las sesiones abiertas se cerraron.",
      },
      MFA_ENABLED: {
        subject: "Activaste la verificación en dos pasos en fik",
        title: "Verificación en dos pasos activada",
        body: "Desde ahora, entrar a tu cuenta de fik con contraseña también pide un código: el de tu app de autenticación o uno enviado a tu correo, según el método que elegiste.",
      },
      MFA_DISABLED: {
        subject: "Se desactivó la verificación en dos pasos en fik",
        title: "Verificación en dos pasos desactivada",
        body: "Tu cuenta de fik ya no pide un código al entrar con contraseña. Las demás sesiones abiertas se cerraron.",
      },
      PASSKEY_ADDED: {
        subject: "Agregaste una llave de acceso a fik",
        title: "Nueva llave de acceso",
        body: "Se agregó la llave de acceso «{detail}» a tu cuenta de fik. Con ella se puede entrar sin contraseña.",
      },
      PASSKEY_REMOVED: {
        subject: "Eliminaste una llave de acceso de fik",
        title: "Llave de acceso eliminada",
        body: "Se eliminó la llave de acceso «{detail}» de tu cuenta de fik.",
      },
      EMAIL_CHANGED: {
        subject: "Cambió el correo de tu cuenta de fik",
        title: "Tu correo cambió",
        body: "El correo de tu cuenta de fik ahora es {detail}. Esta dirección dejó de recibir nuestros correos y ya no sirve para recuperar la cuenta.",
      },
      RECOVERY_CODES_REGENERATED: {
        subject: "Generaste códigos de recuperación nuevos en fik",
        title: "Códigos de recuperación nuevos",
        body: "Se generaron 10 códigos de recuperación nuevos para tu cuenta de fik. Los anteriores ya no sirven. Los dispositivos que habías recordado volverán a pedir el código.",
      },
      TRUSTED_DEVICE_ADDED: {
        subject: "Recordaste un dispositivo en fik",
        title: "Dispositivo recordado",
        body: "En «{detail}» no se volverá a pedir el código de verificación por 30 días al entrar con tu contraseña. Puedes quitarlo en Perfil → Seguridad.",
      },
      MFA_METHOD_CHANGED: {
        subject: "Cambiaste tu verificación en dos pasos en fik",
        title: "Método de verificación cambiado",
        body: "Se cambió el método con que tu cuenta de fik pide el segundo paso al entrar. Los dispositivos que habías recordado volverán a pedir el código.",
      },
      ACCOUNT_DELETED: {
        subject: "Eliminaste tu cuenta de fik",
        title: "Tu cuenta fue eliminada",
        body: "Tu cuenta de fik se eliminó a pedido tuyo. Ya no se puede entrar con ella.",
      },
    },
  },
};

export type EmailCatalog = typeof es;
