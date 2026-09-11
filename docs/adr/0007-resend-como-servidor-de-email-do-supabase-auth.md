# Resend como servidor de e-mail do Supabase Auth

O e-mail transacional sai pelo **Resend, configurado como SMTP customizado do Supabase Auth**. O login é por link mágico (issue #11), então entregar e-mail deixa de ser detalhe de infraestrutura e passa a ser o caminho crítico: e-mail que não chega é gestor que não entra.

O servidor de e-mail embutido do Supabase foi descartado porque só entrega para endereços da própria equipe do projeto e tem limite baixo de envios — serve para o primeiro teste, não para cadastrar locadora de cliente.

A alternativa dentro do Resend era o **Send Email Hook**: o Supabase chama uma Edge Function e nós montamos e enviamos o e-mail pela API do Resend. Rejeitada por ora — dá controle sobre o template, mas custa uma função, um segredo a mais e um endpoint a manter, para um produto que hoje manda um único tipo de e-mail. Por SMTP, não existe código nosso no caminho.

## Consequências

A `RESEND_API_KEY` vive em **dois lugares com donos diferentes**: no formulário de SMTP do projeto Supabase, que é quem de fato envia, e em `.env.local` apenas se algum dia migrarmos para o hook. A aplicação Next.js não lê essa chave.

O Resend exige **domínio verificado** para enviar. Enquanto não houver um, o remetente é o endereço de teste do Resend, que só entrega para o dono da conta — o suficiente para exercitar o fluxo, não para receber cadastro de fora.

Trocar de fornecedor é trocar cinco campos no dashboard do Supabase, não mexer em código. É essa a propriedade que justifica a escolha por SMTP.
