-- Corrige links legados blog.evolutto.com nos artigos (WordPress → site unificado)

UPDATE evolutto_articles SET body = replace(body, 'origin=https:%2F%2Fblog.evolutto.com', 'origin=https:%2F%2Fwww.evolutto.com'), updated_at = now()
WHERE body LIKE '%blog.evolutto.com%';

UPDATE evolutto_articles SET body = replace(
  body,
  'href="https://blog.evolutto.com">aqui</a>',
  'href="/blog/news-evolutto-janeiro-2023">aqui</a>'
), updated_at = now() WHERE slug = 'news-evolutto-fevereiro-2023';

UPDATE evolutto_articles SET body = replace(
  body,
  'href="https://blog.evolutto.com">consultoria híbrida</a>',
  'href="/blog/consultoria-hibrida-entenda-como-funciona-esse-servico">consultoria híbrida</a>'
), updated_at = now() WHERE slug = 'marketing-digital-para-consultoria-confira-dicas-valiosas';

UPDATE evolutto_articles SET body = replace(
  body,
  'href="https://blog.evolutto.com">marketplace Evolutto</a>',
  'href="/blog/marketplace-evolutto-atracao-de-leads-para-nossas-consultorias">marketplace Evolutto</a>'
), updated_at = now() WHERE slug = 'marketing-digital-para-consultoria-confira-dicas-valiosas';

UPDATE evolutto_articles SET body = replace(
  body,
  'href="https://blog.evolutto.com">Clique aqui</a>',
  'href="https://www.evolutto.com/#cta">Clique aqui</a>'
), updated_at = now() WHERE slug = 'transforme-seu-proximo-ano-e-multiplique-resultados-sem-passar-raiva-com-a-estagnacao';

UPDATE evolutto_articles SET body = replace(
  body,
  'href="https://blog.evolutto.com">nossos especialistas do Evolutto</a>',
  'href="https://www.evolutto.com/#cta">nossos especialistas do Evolutto</a>'
), updated_at = now() WHERE slug = 'como-identificar-seu-cliente-ideal-um-guia-definitivo';

UPDATE evolutto_articles SET body = replace(
  body,
  'href="https://blog.evolutto.com">marketing</a>',
  'href="/blog/marketing-digital-para-consultoria-confira-dicas-valiosas">marketing</a>'
), updated_at = now() WHERE slug = 'consultoria-digital-como-evitar-as-ciladas-que-aprisionam-no-modelo-analogico';

UPDATE evolutto_articles SET body = replace(
  body,
  'href="https://blog.evolutto.com">Ferramenta de ROI.</a>',
  'href="https://www.evolutto.com/#cta">Ferramenta de ROI.</a>'
), updated_at = now() WHERE slug = 'diminuir-os-custos-de-consultoria-confira-os-4-primeiros-passos';

UPDATE evolutto_articles SET body = replace(
  body,
  'href="https://blog.evolutto.com">ferramenta</a>',
  'href="https://www.evolutto.com/#cta">ferramenta</a>'
), updated_at = now() WHERE slug = 'diminuir-os-custos-de-consultoria-confira-os-4-primeiros-passos';

-- Qualquer href genérico restante → blog novo
UPDATE evolutto_articles SET body = replace(body, 'href="https://blog.evolutto.com"', 'href="https://www.evolutto.com/blog/"'), updated_at = now()
WHERE body LIKE '%href="https://blog.evolutto.com"%';

UPDATE evolutto_articles SET body = replace(body, 'https://blog.evolutto.com', 'https://www.evolutto.com/blog'), updated_at = now()
WHERE body LIKE '%blog.evolutto.com%';
