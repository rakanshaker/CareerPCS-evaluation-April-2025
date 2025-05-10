import { Companies, db, Posts } from "~/services.server/store";
import type { Route } from "./+types/route";
import { useOutletContext } from "react-router";

export const loader = async ({
  request,
  params,
  context,
}: Route.LoaderArgs) => {
  let database = db(context);
  let post = await database.fetch(Posts.by_id(params.id));
  let company = await database.fetch(Companies.by_id(post.data.company));
  return {
    post: post,
    company: company,
  };
};

export default function PostPage({
  loaderData: { post, company },
  params,
}: Route.ComponentProps) {
  const { infoSectionRef } = useOutletContext<{ infoSectionRef: React.RefObject<HTMLDivElement> }>();

  return (
    <section
      ref={infoSectionRef} // ← ✅ Attach the ref here
      className="z-50 flex max-h-[60%] flex-col rounded-t-2xl bg-white md:m-4 md:max-h-none md:w-[50%] md:max-w-prose md:min-w-[300px] md:rounded-2xl"
      style={{
        boxShadow: "0 0 2px rgb(0 0 0/20%),0 -1px 0 rgb(0 0 0/2%)",
      }}
    >
      <header className="sticky top-0 z-10 flex flex-row gap-2 border-b px-4 pt-4 pb-2">
        <h1>{post.data.title}</h1>
      </header>

      <div className="flex flex-1 flex-col overflow-auto px-4 py-4">
        {post.data.description}
      </div>

      <footer className="sticky bottom-0 z-10 flex flex-row border-t px-4 pt-2 pb-2">
        Company: {company.data.name}
      </footer>
    </section>
  );
}
