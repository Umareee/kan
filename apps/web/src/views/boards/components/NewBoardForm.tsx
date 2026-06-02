import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { HiXMark } from "react-icons/hi2";
import { z } from "zod";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

const schema = z.object({
  name: z
    .string()
    .min(1, { message: t`Board name is required` })
    .max(100, { message: t`Board name cannot exceed 100 characters` }),
  workspacePublicId: z.string(),
});

interface NewBoardInput {
  name: string;
  workspacePublicId: string;
}

export function NewBoardForm() {
  const utils = api.useUtils();
  const { closeModal } = useModal();
  const router = useRouter();
  const { showPopup } = usePopup();
  const { workspace } = useWorkspace();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewBoardInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      workspacePublicId: workspace.publicId || "",
    },
  });

  const refetchBoards = () => utils.board.all.refetch();

  const createBoard = api.board.create.useMutation({
    onSuccess: async (board) => {
      if (!board) {
        showPopup({
          header: t`Error`,
          message: t`Failed to create board`,
          icon: "error",
        });
      } else {
        router.push(`/boards/${board.publicId}`);
      }
      closeModal();

      await refetchBoards();
    },
    onError: () => {
      showPopup({
        header: t`Error`,
        message: t`Failed to create board`,
        icon: "error",
      });
    },
  });

  const onSubmit = (data: NewBoardInput) => {
    createBoard.mutate({
      name: data.name,
      workspacePublicId: data.workspacePublicId,
      lists: [],
      labels: [],
    });
  };

  useEffect(() => {
    const titleElement: HTMLElement | null =
      document.querySelector<HTMLElement>("#name");
    if (titleElement) titleElement.focus();
  }, []);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="px-5 pt-5">
        <div className="text-neutral-9000 flex w-full items-center justify-between pb-4 dark:text-dark-1000">
          <h2 className="text-sm font-bold">{t`New board`}</h2>
          <button
            type="button"
            className="hover:bg-li ght-300 rounded p-1 focus:outline-none dark:hover:bg-dark-300"
            onClick={(e) => {
              e.preventDefault();
              closeModal();
            }}
          >
            <HiXMark size={18} className="dark:text-dark-9000 text-light-900" />
          </button>
        </div>
        <Input
          id="name"
          placeholder={t`Name`}
          {...register("name", { required: true })}
          errorMessage={errors.name?.message}
          onKeyDown={async (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              await handleSubmit(onSubmit)();
            }
          }}
        />
      </div>
      <div className="mt-12 flex items-center justify-end space-x-4 border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        <div>
          <Button type="submit" isLoading={createBoard.isPending}>
            {t`Create board`}
          </Button>
        </div>
      </div>
    </form>
  );
}
