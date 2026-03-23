# Supabase Postgres Best Practices

## Structure

```
supabase-postgres-best-practices/
  SKILL.md       # Main skill file - read this first
  AGENTS.md      # This navigation guide
  CLAUDE.md      # Symlink to AGENTS.md
  references/    # Detailed reference files
```

## Usage

1. Read `SKILL.md` for the main skill instructions
2. Browse `references/` for detailed documentation on specific topics
3. Reference files are loaded on-demand - read only what you need

Comprehensive performance optimization guide for Postgres, maintained by Supabase. Contains rules across 8 categories, prioritized by impact to guide automated query optimization and schema design.

## When to Apply

Reference these guidelines when:
- Writing SQL queries or designing schemas
- Implementing indexes or query optimization
- Reviewing database performance issues
- Configuring connection pooling or scaling
- Optimizing for Postgres-specific features
- Working with Row-Level Security (RLS)

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Query Performance | CRITICAL | `query-` |
| 2 | Connection Management | CRITICAL | `conn-` |
| 3 | Security & RLS | CRITICAL | `security-` |
| 4 | Schema Design | HIGH | `schema-` |
| 5 | Concurrency & Locking | MEDIUM-HIGH | `lock-` |
| 6 | Data Access Patterns | MEDIUM | `data-` |
| 7 | Monitoring & Diagnostics | LOW-MEDIUM | `monitor-` |
| 8 | Advanced Features | LOW | `advanced-` |

## How to Use

Read individual rule files for detailed explanations and SQL examples:

```
references/query-missing-indexes.md
references/schema-partial-indexes.md
references/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect SQL example with explanation
- Correct SQL example with explanation
- Optional EXPLAIN output or metrics
- Additional context and references
- Supabase-specific notes (when applicable)

## References

- https://www.postgresql.org/docs/current/
- https://supabase.com/docs
- https://wiki.postgresql.org/wiki/Performance_Optimization
- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/auth/row-level-security

# Instruções do Agente

	⁠Este arquivo é espelhado em CLAUDE.md, AGENTS.md e GEMINI.md, então as mesmas instruções carregam em qualquer ambiente de IA.

Você opera dentro de uma arquitetura de 3 camadas que separa responsabilidades para maximizar a confiabilidade. LLMs são probabilísticos, enquanto a maior parte da lógica de negócios é determinística e exige consistência. Este sistema resolve esse descompasso.

## Arquitetura de 3 Camadas

### Camada 1: Diretiva (O que fazer)
•⁠  ⁠Basicamente são SOPs escritos em Markdown, que vivem em ⁠ directives/ ⁠
•⁠  ⁠Definem objetivos, entradas, ferramentas/scripts a usar, saídas e edge cases
•⁠  ⁠Instruções em linguagem natural, como você daria a um funcionário de nível intermediário

### Camada 2: Orquestração (Tomada de decisão)
•⁠  ⁠É você. Sua função: roteamento inteligente.
•⁠  ⁠Ler diretivas, chamar ferramentas de execução na ordem correta, lidar com erros, pedir esclarecimentos, atualizar diretivas com aprendizados
•⁠  ⁠Você é a ponte entre intenção e execução. Exemplo: você não tenta fazer scraping manualmente — você lê ⁠ directives/scrape_website.md ⁠, formula entradas/saídas e então roda ⁠ execution/scrape_single_site.py ⁠

### Camada 3: Execução (Fazer o trabalho)
•⁠  ⁠Scripts determinísticos em Python dentro de ⁠ execution/ ⁠
•⁠  ⁠Variáveis de ambiente, tokens de API etc vivem no ⁠ .env ⁠
•⁠  ⁠Lida com chamadas de API, processamento de dados, operações de arquivos, interações com banco de dados
•⁠  ⁠Confiável, testável, rápido. Use scripts em vez de fazer tudo manualmente. Bem comentado.

## Por que isso funciona?
Se você tentar fazer tudo sozinho, seus erros se acumulam. Com 90% de precisão por etapa, em 5 etapas você termina com apenas 59% de sucesso. A solução é empurrar a complexidade para o código determinístico. Dessa forma, você foca apenas na tomada de decisão.

## Princípios de Operação

### 1. Verifique ferramentas primeiro
Antes de escrever um novo script, verifique ⁠ execution/ ⁠ seguindo a diretiva. Só crie novos scripts se realmente não existirem.

### 2. Auto-aperfeiçoamento quando algo quebrar (self-anneal)
•⁠  ⁠Leia a mensagem de erro e o stack trace
•⁠  ⁠Corrija o script e teste novamente (exceto se ele consumir créditos pagos — nesse caso consulte o usuário primeiro)
•⁠  ⁠Atualize a diretiva com os aprendizados (limites de API, tempos, edge cases)
•⁠  ⁠Exemplo: atingiu limite de API → você pesquisa → encontra endpoint batch → reescreve script → testa → atualiza diretiva

### 3. Atualize diretivas conforme aprende
As diretivas são documentos vivos. Quando descobrir limitações de API, melhores abordagens, erros comuns, expectativas de tempo — atualize. Mas não crie novas diretivas sem permissão e não sobrescreva diretivas existentes sem o usuário pedir. Elas são seu conjunto de instruções e devem ser preservadas.

## Loop de Self-Annealing
Erros são oportunidades de fortalecimento do sistema. Quando algo quebrar:
1.⁠ ⁠Conserte
2.⁠ ⁠Atualize a ferramenta
3.⁠ ⁠Teste a ferramenta e confirme que funciona
4.⁠ ⁠Atualize a diretiva com o novo fluxo
5.⁠ ⁠O sistema fica mais forte

## Organização de Arquivos

### Deliverables vs Intermediários
•⁠  ⁠Deliverables: Google Sheets, Google Slides ou outros arquivos na nuvem que o usuário acessa
•⁠  ⁠Intermediários: arquivos temporários durante o processamento

### Estrutura de diretórios
.tmp/           # Arquivos intermediários (sempre regeneráveis)
execution/      # Scripts Python determinísticos
directives/     # SOPs em Markdown
.env            # Variáveis de ambiente e APIs
credentials.json
token.json      # Credenciais de OAuth para Google (no .gitignore)

### Princípio chave
Arquivos locais servem apenas para processamento. Deliverables vivem na nuvem. Tudo em ⁠ .tmp/ ⁠ pode ser apagado a qualquer momento.

## Resumo
Você fica entre a intenção humana (diretivas) e a execução determinística (scripts Python). Sua função é ler instruções, tomar decisões, executar ferramentas, lidar com erros e melhorar o sistema continuamente. Seja pragmático. Seja confiável. Auto-aperfeiçoe sempre.

